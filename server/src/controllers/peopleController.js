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

// Roles that manage volunteers: the whole campaign chain above them.
function requireVolunteerManager(req) {
    if (req.user?.is_super_admin) return;
    if (['candidate', 'admin', 'sub_admin'].includes(req.user?.role)) return;
    throw new ForbiddenError('Only campaign staff may manage volunteers');
}

/**
 * The campaign (political_candidate_id) the caller acts for. A candidate IS
 * their own campaign; campaign/sub admins carry it on their grant. Null only
 * for super-admins (they pass it explicitly).
 */
function campaignOf(req) {
    if (req.user?.is_super_admin) return null;
    return req.user?.political_candidate_id
        || (req.user?.role === 'candidate' ? req.user.user_id : null);
}

// Sub-admins may only hand out wards within their own assignment.
function checkWardScope(req, wards) {
    const mine = req.user?.allowed_wards;
    if (!mine?.length) return;
    for (const w of (wards || [])) {
        if (!mine.includes(w)) throw new ForbiddenError(`Ward ${w} is outside your scope`);
    }
}

// ──────────────────────────── political candidates ────────────────────────────

/** POST /api/people/candidates — super-admin creates a political candidate */
async function createCandidate(req, res) {
    requireSuperAdmin(req);
    const { name, username, password, email, phone, constituency_id, constituency_ids } = req.body || {};
    if (!name || !username || !password) {
        throw new ValidationError('name, username and password are required');
    }
    const list = (constituency_ids?.length ? constituency_ids : (constituency_id ? [constituency_id] : []));

    const hash = await hashPassword(password);
    const user = await userModel.create({
        username,
        email: email || null,
        name,
        passwordHash: hash,
        role: 'candidate',
        phone: phone || null,
    });

    for (const cid of list) {
        await candidateModel.grantUserAccess({
            userId: user.user_id,
            candidateId: cid,
            role: 'candidate',
            grantedBy: req.user.user_id,
            politicalCandidateId: user.user_id,
        });
    }

    res.status(201).json({ success: true, candidate: user, constituencies: list });
}

/** GET /api/people/candidates — super-admin lists all political candidates */
async function listCandidates(req, res) {
    requireSuperAdmin(req);
    const users = await userModel.listByRole('candidate');
    res.json({ success: true, candidates: users });
}

/** PUT /api/people/candidates/:user_id/constituency — assign one or many constituencies */
async function assignConstituency(req, res) {
    requireSuperAdmin(req);
    const { user_id } = req.params;
    const { constituency_id, constituency_ids } = req.body || {};
    const list = (constituency_ids?.length ? constituency_ids : (constituency_id ? [constituency_id] : []));
    if (!list.length) throw new ValidationError('at least one constituency required');

    const uid = parseInt(user_id, 10);
    const user = await userModel.findById(uid);
    if (!user || user.role !== 'candidate') throw new NotFoundError('Political candidate not found');

    for (const cid of list) {
        const constituency = await candidateModel.findById(cid);
        if (!constituency) throw new NotFoundError(`Constituency ${cid} not found`);
        await candidateModel.grantUserAccess({
            userId: uid,
            candidateId: cid,
            role: 'candidate',
            grantedBy: req.user.user_id,
            politicalCandidateId: uid,
        });
    }
    // Drop any candidate-role grants for constituencies no longer in the list.
    await candidateModel.revokeCandidateGrants(uid, list);

    res.json({ success: true });
}

/** DELETE /api/people/candidates/:user_id — super-admin deletes a political candidate */
async function deleteCandidate(req, res) {
    requireSuperAdmin(req);
    const uid = parseInt(req.params.user_id, 10);
    const user = await userModel.findById(uid);
    if (!user || user.role !== 'candidate') throw new NotFoundError('Political candidate not found');
    // Hard delete: user_candidates grants cascade; canvassing.political_candidate_id
    // is set null by its FK. (A candidate being removed is typically an unused entry.)
    await userModel.remove(uid);
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
    requireVolunteerManager(req);

    const { user_id: existingUserId, name, username, password, email, phone,
            constituency_id, wards } = req.body || {};

    if (!constituency_id) throw new ValidationError('constituency_id required');
    if (!wards?.length)   throw new ValidationError('at least one ward required');

    // Verify caller has access to this constituency
    if (!req.user.is_super_admin) {
        const grant = (req.user.candidates || []).find((c) => c.id === constituency_id);
        if (!grant) throw new ForbiddenError('You are not assigned to this constituency');
    }
    checkWardScope(req, wards);

    const politicalCandidateId = req.user.is_super_admin
        ? (req.body.political_candidate_id || null)
        : campaignOf(req);

    let volunteer;
    if (existingUserId) {
        // Attaching an EXISTING volunteer — the multi-candidate case: the same
        // person canvasses for several candidates, each grant its own campaign.
        volunteer = await userModel.findById(parseInt(existingUserId, 10));
        if (!volunteer) throw new NotFoundError('User not found');
        if (volunteer.role !== 'volunteer') {
            throw new ValidationError(`@${volunteer.username} is a ${volunteer.role}, not a volunteer`);
        }
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
    requireVolunteerManager(req);
    const { constituency_id } = req.query;
    if (!constituency_id) throw new ValidationError('constituency_id required');

    const politicalCandidateId = req.user.is_super_admin
        ? (req.query.political_candidate_id || null)
        : campaignOf(req);

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
    requireVolunteerManager(req);
    const { user_id } = req.params;
    const { constituency_id, wards } = req.body || {};
    if (!constituency_id) throw new ValidationError('constituency_id required');
    if (!wards?.length)   throw new ValidationError('wards required');
    checkWardScope(req, wards);

    const politicalCandidateId = req.user.is_super_admin
        ? (req.body.political_candidate_id || null)
        : campaignOf(req);

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
    requireVolunteerManager(req);
    const { constituency_id } = req.query;
    if (!constituency_id) throw new ValidationError('constituency_id required');

    // Non-super callers only revoke THEIR campaign's grant — a volunteer shared
    // with another candidate keeps that candidate's assignment untouched.
    const uid = parseInt(req.params.user_id, 10);
    await candidateModel.revokeUserAccess(uid, constituency_id, {
        politicalCandidateId: req.user.is_super_admin ? null : campaignOf(req),
    });

    // If the volunteer no longer belongs to any constituency, delete the account
    // entirely so it doesn't linger as an orphaned login.
    const remaining = await candidateModel.listForUser(uid);
    const user = await userModel.findById(uid);
    if (user?.role === 'volunteer' && remaining.length === 0) {
        await userModel.remove(uid);
    }
    res.json({ success: true });
}

module.exports = {
    createCandidate,
    listCandidates,
    assignConstituency,
    deleteCandidate,
    createOrAssignVolunteer,
    listVolunteers,
    updateVolunteerWards,
    removeVolunteer,
};
