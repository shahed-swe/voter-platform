const userModel = require('../models/userModel');
const candidateModel = require('../models/candidateModel');
const { comparePassword } = require('../utils/password');
const { sign } = require('../utils/jwt');
const { AuthError, ValidationError, ForbiddenError } = require('../utils/errors');

/**
 * Build the JWT payload for a user.
 *  - super_admins: have NO candidate scope unless they pick one (frontend
 *    drives switching). They can see all candidates in the list.
 *  - regular users: must belong to ≥1 candidate; we auto-activate the first
 *    one when there's exactly one.
 */
async function buildTokenPayload(user, { forceCandidate, forcePoliticalCandidate } = {}) {
    const grants = await candidateModel.listForUser(user.user_id);
    const isSuper = !!user.is_super_admin;

    // A volunteer may hold several grants for the SAME constituency under
    // different political candidates. The active grant is therefore identified by
    // (constituency, political_candidate) — not constituency alone.
    const activeCandidate = forceCandidate || grants[0]?.candidate_id || null;
    const inCandidate = grants.filter((g) => g.candidate_id === activeCandidate);
    const activeGrant =
        (forcePoliticalCandidate != null
            && inCandidate.find((g) => String(g.political_candidate_id) === String(forcePoliticalCandidate)))
        || inCandidate[0]
        || grants[0]
        || null;

    // Ward restriction and political_candidate_id apply only to the active grant.
    // Volunteers see only their allowed wards; political candidates see everything
    // in their constituency but are scoped by their own user_id.
    const allowedWards = activeGrant?.allowed_wards || null;
    const allowedVoterAreas = activeGrant?.allowed_voter_areas || null;
    const politicalCandidateId = activeGrant?.political_candidate_id
        // If role is 'candidate', they ARE the political candidate
        || (activeGrant?.role === 'candidate' ? user.user_id : null)
        || null;

    return {
        user_id:               user.user_id,
        username:              user.username,
        email:                 user.email,
        name:                  user.name,
        role:                  user.role,
        is_super_admin:        isSuper,
        candidates:            grants.map((g) => ({
            grant_id:              g.grant_id,
            id:                    g.candidate_id,
            constituency:          g.constituency,
            constituency_name:     g.name,
            role:                  g.role,
            allowed_wards:         g.allowed_wards || null,
            allowed_voter_areas:   g.allowed_voter_areas || null,
            political_candidate_id: g.political_candidate_id || null,
            political_candidate_name: g.political_candidate_name || null,
        })),
        active_candidate:      activeCandidate,
        active_political_candidate_id: politicalCandidateId,
        allowed_wards:         allowedWards,
        allowed_voter_areas:   allowedVoterAreas,
        political_candidate_id: politicalCandidateId,
    };
}

async function login(req, res) {
    const { username, password } = req.body || {};
    if (!username || !password) throw new ValidationError('Username and password required');

    const user = await userModel.findByUsernameOrEmail(username);
    if (!user || !user.is_active) throw new AuthError('Invalid credentials');

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) throw new AuthError('Invalid credentials');

    // Surface is_super_admin from DB (findByUsernameOrEmail returns it now)
    const fullUser = await userModel.findById(user.user_id);
    const payload = await buildTokenPayload({ ...user, ...fullUser });

    // Reject users with no candidate access (super_admins are allowed through)
    if (!payload.is_super_admin && payload.candidates.length === 0) {
        throw new ForbiddenError('No campaign assigned to this account. Contact your administrator.');
    }

    const token = sign(payload);

    res.json({
        success: true,
        token,
        user: {
            user_id: payload.user_id,
            username: payload.username,
            email: payload.email,
            name: payload.name,
            role: payload.role,
            is_super_admin: payload.is_super_admin,
            password_changed: user.password_changed,
            allowed_wards: payload.allowed_wards,
            allowed_voter_areas: payload.allowed_voter_areas,
            political_candidate_id: payload.political_candidate_id,
        },
        candidates: payload.candidates,
        active_candidate: payload.active_candidate,
    });
}

async function logout(_req, res) {
    res.json({ success: true });
}

async function me(req, res) {
    const user = await userModel.findById(req.user.user_id);
    if (!user) throw new AuthError('User not found');

    let activeCandidate = null;
    if (req.user.active_candidate) {
        activeCandidate = await candidateModel.findById(req.user.active_candidate);
    }

    res.json({
        success: true,
        user: {
            ...user,
            is_super_admin: !!req.user.is_super_admin,
            allowed_wards: req.user.allowed_wards || null,
            allowed_voter_areas: req.user.allowed_voter_areas || null,
            political_candidate_id: req.user.political_candidate_id || null,
        },
        candidates: req.user.candidates || [],
        active_candidate: activeCandidate,
    });
}

async function verify(req, res) {
    res.json({ success: true, user: req.user });
}

/**
 * Switch to a different candidate. Issues a fresh JWT with that candidate
 * as active. The user must already have access (via user_candidates) or be
 * a super_admin.
 */
async function switchCandidate(req, res) {
    const { candidate_id, political_candidate_id } = req.body || {};
    if (!candidate_id) throw new ValidationError('candidate_id required');

    const fullUser = await userModel.findById(req.user.user_id);
    if (!fullUser?.is_active) throw new AuthError('User not active');

    const candidate = await candidateModel.findById(candidate_id);
    if (!candidate || candidate.status !== 'active') throw new ValidationError('Unknown candidate');

    const isSuper = !!fullUser.is_super_admin;
    if (!isSuper) {
        const role = await candidateModel.userHasAccess(req.user.user_id, candidate_id);
        if (!role) throw new ForbiddenError('You do not have access to this candidate');
    }

    const payload = await buildTokenPayload(fullUser, {
        forceCandidate: candidate_id,
        forcePoliticalCandidate: political_candidate_id,
    });
    const token = sign(payload);

    res.json({
        success: true,
        token,
        active_candidate: candidate,
        active_political_candidate_id: payload.active_political_candidate_id,
        allowed_wards: payload.allowed_wards,
    });
}

module.exports = { login, logout, me, verify, switchCandidate };
