'use strict';
/**
 * Unified people management for the role hierarchy (#12):
 *
 *   Super Admin → Candidate → Campaign Admin (admin) → Sub-admin → Volunteer
 *
 * One place to create users down the chain and assign each their region
 * (constituency → ward → voter area). Every caller only sees / manages the
 * levels and regions below them.
 */
const { one, many, query } = require('../db/pool');
const userModel = require('../models/userModel');
const candidateModel = require('../models/candidateModel');
const { hashPassword } = require('../utils/password');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

// Role rank + who each role may create (down only).
const RANK = { super_admin: 4, candidate: 3, admin: 2, sub_admin: 1, volunteer: 0 };
const CREATABLE = {
    super_admin: ['candidate', 'admin', 'sub_admin', 'volunteer'],
    candidate:   ['admin', 'sub_admin', 'volunteer'],
    admin:       ['sub_admin', 'volunteer'],
    sub_admin:   ['volunteer'],
    volunteer:   [],
};
// The region granularity a role is scoped to / assigned.
const REGION_OF = { candidate: 'constituency', admin: 'constituency', sub_admin: 'ward', volunteer: 'voter_area' };

function callerRole(req) {
    return req.user?.is_super_admin ? 'super_admin' : (req.user?.role || null);
}

/** The campaign (political candidate) the caller belongs to. Null for super-admin. */
function campaignId(req) {
    return req.user?.is_super_admin ? null : (req.user?.political_candidate_id || req.user?.user_id || null);
}

/** Constituencies the caller may assign within. */
function callerConstituencies(req) {
    if (req.user?.is_super_admin) return null; // all
    return (req.user?.candidates || []).map((g) => g.id);
}

async function distinctWards(candidateId, limitToWards) {
    const rows = await many(
        `SELECT DISTINCT ward FROM voters
          WHERE candidate_id = $1 AND ward IS NOT NULL AND ward <> ''
          ORDER BY ward`,
        [candidateId]
    );
    let wards = rows.map((r) => r.ward);
    if (limitToWards?.length) wards = wards.filter((w) => limitToWards.includes(w));
    return wards;
}

async function distinctVoterAreas(candidateId, wards) {
    const params = [candidateId];
    let wardClause = '';
    if (wards?.length) { params.push(wards); wardClause = `AND ward = ANY($2)`; }
    const rows = await many(
        `SELECT DISTINCT voter_area_name FROM voters
          WHERE candidate_id = $1 AND voter_area_name IS NOT NULL AND voter_area_name <> '' ${wardClause}
          ORDER BY voter_area_name`,
        params
    );
    return rows.map((r) => r.voter_area_name);
}

/**
 * GET /api/management/context
 * What the caller can do: creatable roles + the regions they can assign.
 */
async function context(req, res) {
    const role = callerRole(req);
    if (!role || !CREATABLE[role]?.length) {
        return res.json({ success: true, role, creatable_roles: [], constituencies: [] });
    }

    // Constituencies available to assign.
    let constituencies;
    if (req.user.is_super_admin) {
        constituencies = await candidateModel.listActive();
    } else {
        const mine = callerConstituencies(req);
        const all = await candidateModel.listActive();
        constituencies = all.filter((c) => mine.includes(c.candidate_id));
    }

    res.json({
        success: true,
        role,
        campaign_id: campaignId(req),
        creatable_roles: CREATABLE[role],
        region_of: REGION_OF,
        // Sub-admins assign voter areas within their own wards; expose those.
        my_wards: req.user?.allowed_wards || null,
        my_voter_areas: req.user?.allowed_voter_areas || null,
        constituencies: constituencies.map((c) => ({
            candidate_id: c.candidate_id, name: c.name, constituency: c.constituency,
        })),
    });
}

/** GET /api/management/wards?constituency_id=… — wards the caller may assign in a constituency. */
async function wards(req, res) {
    const cid = req.query.constituency_id;
    if (!cid) throw new ValidationError('constituency_id required');
    // Sub-admins are limited to their own wards; others get all wards of the constituency.
    const limit = callerRole(req) === 'sub_admin' ? (req.user.allowed_wards || []) : null;
    res.json({ success: true, wards: await distinctWards(cid, limit) });
}

/** GET /api/management/voter-areas?constituency_id=…&wards=৫২,৫৩ — areas within wards. */
async function voterAreas(req, res) {
    const cid = req.query.constituency_id;
    if (!cid) throw new ValidationError('constituency_id required');
    const wardList = (req.query.wards || '').split(',').map((s) => s.trim()).filter(Boolean);
    let scopeWards = wardList;
    // Sub-admins can only reach their own wards' areas.
    if (callerRole(req) === 'sub_admin') {
        const allowed = req.user.allowed_wards || [];
        scopeWards = (scopeWards.length ? scopeWards : allowed).filter((w) => allowed.includes(w));
    }
    res.json({ success: true, voter_areas: await distinctVoterAreas(cid, scopeWards) });
}

/**
 * GET /api/management/users — users the caller manages (their campaign, roles below them).
 */
async function listUsers(req, res) {
    const role = callerRole(req);
    if (!role || role === 'volunteer') throw new ForbiddenError('You cannot manage users');

    const params = [];
    const where = [`u.is_active = true`];

    if (!req.user.is_super_admin) {
        params.push(campaignId(req));
        where.push(`uc.political_candidate_id = $${params.length}`);
    }
    // Only roles strictly below the caller.
    const below = Object.keys(RANK).filter((r) => RANK[r] < RANK[role] && r !== 'super_admin');
    params.push(below);
    where.push(`uc.role = ANY($${params.length})`);

    // Sub-admins only see volunteers within their wards.
    if (role === 'sub_admin' && req.user.allowed_wards?.length) {
        params.push(req.user.allowed_wards);
        where.push(`uc.allowed_wards && $${params.length}`);
    }

    const rows = await many(
        `SELECT DISTINCT ON (u.user_id, uc.candidate_id)
                u.user_id, u.username, u.name, u.email, u.phone, u.is_active,
                uc.candidate_id, uc.role, uc.allowed_wards, uc.allowed_voter_areas,
                uc.political_candidate_id, c.name AS constituency_name
           FROM user_candidates uc
           JOIN users u ON u.user_id = uc.user_id
           JOIN candidates c ON c.candidate_id = uc.candidate_id
          WHERE ${where.join(' AND ')}
          ORDER BY u.user_id, uc.candidate_id, uc.role`,
        params
    );
    res.json({ success: true, users: rows });
}

/**
 * POST /api/management/users
 * Body: { name, username, password, email?, phone?, role, constituency_id,
 *         wards?: [...], voter_areas?: [...], user_id? (link existing) }
 */
async function createUser(req, res) {
    const role = callerRole(req);
    const {
        user_id: existingUserId, name, username, password, email, phone,
        role: targetRole, constituency_id, constituency_ids, wards: wardList, voter_areas: areaList,
    } = req.body || {};

    if (!targetRole) throw new ValidationError('role is required');
    if (!CREATABLE[role]?.includes(targetRole)) {
        throw new ForbiddenError(`A ${role} cannot create a ${targetRole}.`);
    }
    // Accept one or many constituencies (multi-select).
    const constituencies = (constituency_ids?.length ? constituency_ids : (constituency_id ? [constituency_id] : []));
    if (!constituencies.length) throw new ValidationError('at least one constituency is required');

    // Region within the caller's scope.
    const myConstituencies = callerConstituencies(req);
    if (myConstituencies) {
        for (const cid of constituencies) {
            if (!myConstituencies.includes(cid)) throw new ForbiddenError(`Constituency ${cid} is outside your scope`);
        }
    }
    if (targetRole === 'sub_admin' && !wardList?.length) {
        throw new ValidationError('At least one ward is required for a sub-admin');
    }
    if (targetRole === 'volunteer' && !areaList?.length && !wardList?.length) {
        throw new ValidationError('At least one voter area (or ward) is required for a volunteer');
    }
    // Sub-admins may only hand out their own wards/areas.
    if (role === 'sub_admin') {
        const mine = req.user.allowed_wards || [];
        for (const w of (wardList || [])) if (!mine.includes(w)) throw new ForbiddenError(`Ward ${w} is outside your scope`);
    }

    // Resolve or create the user.
    let target;
    if (existingUserId) {
        target = await userModel.findById(parseInt(existingUserId, 10));
        if (!target) throw new NotFoundError('User not found');
    } else {
        if (!name || !username || !password) {
            throw new ValidationError('name, username and password are required');
        }
        const hash = await hashPassword(password);
        target = await userModel.create({
            username, email: email || null, name, passwordHash: hash,
            role: targetRole, phone: phone || null, referredBy: req.user.user_id,
        });
    }

    // Campaign tenant: the caller's campaign, or (super-admin creating a candidate)
    // the new candidate themselves.
    const politicalCandidateId = req.user.is_super_admin
        ? (targetRole === 'candidate' ? target.user_id : (req.body.political_candidate_id || null))
        : campaignId(req);

    // One grant per selected constituency.
    for (const cid of constituencies) {
        await candidateModel.grantUserAccess({
            userId: target.user_id,
            candidateId: cid,
            role: targetRole,
            grantedBy: req.user.user_id,
            allowedWards: (targetRole === 'sub_admin' || targetRole === 'volunteer') ? (wardList || null) : null,
            allowedVoterAreas: targetRole === 'volunteer' ? (areaList || null) : null,
            politicalCandidateId,
        });
    }

    res.status(201).json({ success: true, user: target });
}

/** PUT /api/management/users/:user_id/region — update a managed user's region. */
async function updateRegion(req, res) {
    const role = callerRole(req);
    const { constituency_id, role: targetRole, wards: wardList, voter_areas: areaList } = req.body || {};
    if (!constituency_id || !targetRole) throw new ValidationError('constituency_id and role required');
    if (RANK[targetRole] >= RANK[role]) throw new ForbiddenError('Outside your scope');

    await candidateModel.grantUserAccess({
        userId: parseInt(req.params.user_id, 10),
        candidateId: constituency_id,
        role: targetRole,
        grantedBy: req.user.user_id,
        allowedWards: wardList || null,
        allowedVoterAreas: targetRole === 'volunteer' ? (areaList || null) : null,
        politicalCandidateId: req.user.is_super_admin ? (req.body.political_candidate_id || null) : campaignId(req),
    });
    res.json({ success: true });
}

/** DELETE /api/management/users/:user_id — remove a managed user (hard delete). */
async function removeUser(req, res) {
    const role = callerRole(req);
    if (!role || role === 'volunteer') throw new ForbiddenError('You cannot delete users');
    const uid = parseInt(req.params.user_id, 10);
    if (uid === req.user.user_id) throw new ForbiddenError('Cannot delete yourself');

    const target = await userModel.findById(uid);
    if (!target) throw new NotFoundError('User not found');
    if (RANK[target.role] >= RANK[role]) throw new ForbiddenError('Cannot delete a user at or above your level');
    await userModel.remove(uid);
    res.json({ success: true });
}

module.exports = { context, wards, voterAreas, listUsers, createUser, updateRegion, removeUser };
