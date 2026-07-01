/**
 * peopleController — manages political candidates and volunteers.
 *
 * Political candidates are created by super-admins and optionally linked to a
 * constituency.  Volunteers are created/assigned by political candidates and are
 * scoped to specific wards within that constituency.
 *
 * Terminology:
 *   constituency — what the DB calls `candidate_id` (Dhaka-4, Dhaka-5, …)
 *   political candidate — a person running for election; a user with role='candidate'
 *   volunteer — a data-collector assigned to a political candidate + specific wards
 */
'use strict';

const userModel      = require('../models/userModel');
const candidateModel = require('../models/candidateModel');
const { hashPassword, generateTempPassword } = require('../utils/password');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

// ──────────────────────────── helpers ────────────────────────────────────────

function requireSuperAdmin(req) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');
}

function requireCandidateOrSuper(req) {
    if (req.user?.is_super_admin) return;
    if (req.user?.role === 'candidate') return;
    throw new ForbiddenError('Candidate or super-admin only');
}

function actingAs(req) {
    // Returns the political_candidate_id the requester represents.
    // For a 'candidate' user this is their own user_id.
    // Super-admins must pass it via query/body.
    if (req.user?.role === 'candidate') return req.user.user_id;
    return null; // super-admin: caller provides context
}

// ──────────────────────────── political candidates ────────────────────────────

/** POST /api/people/candidates — super-admin creates a political candidate */
async function createCandidate(req, res) {
    requireSuperAdmin(req);
    const { name, username, password, email, phone, constituency_id } = req.body || {};
    if (!name || !username || !password) {
        throw new ValidationError('name, username and password are required');
    }

    const hash = await hashPassword(password);
    const user = await userModel.create({
        username,
        email: email || null,
        name,
        passwordHash: hash,
        role: 'candidate',
        phone: phone || null,
    });

    if (constituency_id) {
        await candidateModel.grantUserAccess({
            userId: user.user_id,
            candidateId: constituency_id,
            role: 'candidate',
            grantedBy: req.user.user_id,
            politicalCandidateId: user.user_id,
        });
    }

    res.status(201).json({ success: true, candidate: user, constituency_id: constituency_id || null });
}

/** GET /api/people/candidates — super-admin lists all political candidates */
async function listCandidates(req, res) {
    requireSuperAdmin(req);
    const users = await userModel.listByRole('candidate');
    res.json({ success: true, candidates: users });
}

/** PUT /api/people/candidates/:user_id/constituency — assign/change constituency */
async function assignConstituency(req, res) {
    requireSuperAdmin(req);
    const { user_id } = req.params;
    const { constituency_id } = req.body || {};
    if (!constituency_id) throw new ValidationError('constituency_id required');

    const user = await userModel.findById(parseInt(user_id, 10));
    if (!user || user.role !== 'candidate') throw new NotFoundError('Political candidate not found');

    const constituency = await candidateModel.findById(constituency_id);
    if (!constituency) throw new NotFoundError('Constituency not found');

    const uid = parseInt(user_id, 10);
    await candidateModel.grantUserAccess({
        userId: uid,
        candidateId: constituency_id,
        role: 'candidate',
        grantedBy: req.user.user_id,
        politicalCandidateId: uid,
    });
    // A political candidate represents exactly one constituency — drop any
    // previous candidate-role grants so the assignment doesn't accumulate.
    await candidateModel.revokeCandidateGrants(uid, constituency_id);

    res.json({ success: true });
}

// ──────────────────────────── volunteers ─────────────────────────────────────

/**
 * POST /api/people/volunteers
 * Candidate creates a volunteer (new or existing user) and assigns wards.
 * Body: { name, username, password, email, phone, constituency_id, wards: ['৫২','৫৩'] }
 *   OR: { user_id (existing), constituency_id, wards: ['৫২'] }
 */
async function createOrAssignVolunteer(req, res) {
    requireCandidateOrSuper(req);

    const { user_id: existingUserId, name, username, password, email, phone,
            constituency_id, wards } = req.body || {};

    if (!constituency_id) throw new ValidationError('constituency_id required');
    if (!wards?.length)   throw new ValidationError('at least one ward required');

    // Verify caller has access to this constituency
    if (!req.user.is_super_admin) {
        const grant = (req.user.candidates || []).find((c) => c.id === constituency_id);
        if (!grant) throw new ForbiddenError('You are not assigned to this constituency');
    }

    const politicalCandidateId = req.user.is_super_admin
        ? (req.body.political_candidate_id || null)
        : req.user.user_id;

    let volunteer;
    if (existingUserId) {
        volunteer = await userModel.findById(parseInt(existingUserId, 10));
        if (!volunteer) throw new NotFoundError('User not found');
    } else {
        if (!name || !username || !password) {
            throw new ValidationError('name, username and password required for new volunteer');
        }
        const hash = await hashPassword(password);
        volunteer = await userModel.create({
            username,
            email: email || null,
            name,
            passwordHash: hash,
            role: 'volunteer',
            phone: phone || null,
        });
    }

    await candidateModel.grantUserAccess({
        userId: volunteer.user_id,
        candidateId: constituency_id,
        role: 'volunteer',
        grantedBy: req.user.user_id,
        allowedWards: wards,
        politicalCandidateId,
    });

    res.status(201).json({ success: true, volunteer, wards });
}

/**
 * GET /api/people/volunteers?constituency_id=dhaka10
 * Lists volunteers for a constituency scoped to the requester's political_candidate_id.
 */
async function listVolunteers(req, res) {
    requireCandidateOrSuper(req);
    const { constituency_id } = req.query;
    if (!constituency_id) throw new ValidationError('constituency_id required');

    const politicalCandidateId = req.user.is_super_admin
        ? (req.query.political_candidate_id || null)
        : req.user.user_id;

    const users = await candidateModel.listUsersForConstituency(constituency_id, {
        politicalCandidateId,
    });
    res.json({ success: true, volunteers: users.filter((u) => u.role === 'volunteer') });
}

/**
 * PUT /api/people/volunteers/:user_id/wards
 * Update ward assignment for a volunteer.
 */
async function updateVolunteerWards(req, res) {
    requireCandidateOrSuper(req);
    const { user_id } = req.params;
    const { constituency_id, wards } = req.body || {};
    if (!constituency_id) throw new ValidationError('constituency_id required');
    if (!wards?.length)   throw new ValidationError('wards required');

    const politicalCandidateId = req.user.is_super_admin
        ? (req.body.political_candidate_id || null)
        : req.user.user_id;

    await candidateModel.grantUserAccess({
        userId: parseInt(user_id, 10),
        candidateId: constituency_id,
        role: 'volunteer',
        grantedBy: req.user.user_id,
        allowedWards: wards,
        politicalCandidateId,
    });

    res.json({ success: true });
}

/** DELETE /api/people/volunteers/:user_id?constituency_id=dhaka10 */
async function removeVolunteer(req, res) {
    requireCandidateOrSuper(req);
    const { constituency_id } = req.query;
    if (!constituency_id) throw new ValidationError('constituency_id required');

    await candidateModel.revokeUserAccess(parseInt(req.params.user_id, 10), constituency_id);
    res.json({ success: true });
}

module.exports = {
    createCandidate,
    listCandidates,
    assignConstituency,
    createOrAssignVolunteer,
    listVolunteers,
    updateVolunteerWards,
    removeVolunteer,
};
