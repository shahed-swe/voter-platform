const { safeVerify, TOKEN_VERSION } = require('../utils/jwt');
const { AuthError, ForbiddenError } = require('../utils/errors');

// Authorization header ONLY — query-string / body tokens leak into logs,
// referrers, and browser history, so they are not accepted.
function extractToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
    return null;
}

function verifyToken(req, _res, next) {
    const token = extractToken(req);
    if (!token) return next(new AuthError('No authentication token provided'));

    const decoded = safeVerify(token);
    if (!decoded) return next(new AuthError('Invalid or expired token'));
    // A token minted before the payload structure changed carries stale
    // claims the scoping code would misread — force a fresh login.
    if (decoded.v !== TOKEN_VERSION) {
        return next(new AuthError('Session outdated — please log in again'));
    }

    req.user = decoded;
    req.token = token;
    next();
}

function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (token) {
        const decoded = safeVerify(token);
        if (decoded) req.user = decoded;
    }
    next();
}

function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) return next(new AuthError());
        if (!roles.includes(req.user.role)) return next(new ForbiddenError());
        next();
    };
}

module.exports = { verifyToken, optionalAuth, requireRole };
