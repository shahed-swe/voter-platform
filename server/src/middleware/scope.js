const { AuthError, ForbiddenError } = require('../utils/errors');

/**
 * Single chokepoint that scopes every authenticated request to one candidate.
 * Reads req.user (set by verifyToken) and stamps req.candidateId.
 *
 *  - super_admins MAY operate without active_candidate (e.g. /admin routes).
 *    For data routes, they should pick a candidate first; we still allow
 *    requests through if active_candidate is present.
 *  - regular users without an active candidate are rejected. (Login should
 *    have set one when they have ≥1 grant.)
 */
function scopeToCandidate(req, _res, next) {
    if (!req.user) return next(new AuthError());

    const active = req.user.active_candidate;
    if (!active) {
        // Super admins and party-level users (Political Admin / Donor) may
        // operate without an active constituency; endpoints that require one
        // still throw via their local tenant() guard.
        const hasPartyGrant = (req.user.parties || []).length > 0;
        if (req.user.is_super_admin || hasPartyGrant) {
            req.candidateId = null;
            return next();
        }
        return next(new ForbiddenError('Pick a candidate first'));
    }
    req.candidateId = active;
    next();
}

/** Throws if there's no candidateId — used on endpoints that REQUIRE one. */
function requireCandidate(req, _res, next) {
    if (!req.candidateId) return next(new ForbiddenError('No candidate selected'));
    next();
}

function requireSuperAdmin(req, _res, next) {
    if (!req.user?.is_super_admin) return next(new ForbiddenError('Super-admin only'));
    next();
}

module.exports = { scopeToCandidate, requireCandidate, requireSuperAdmin };
