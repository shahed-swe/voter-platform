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
const partyModel = require('../models/partyModel');
const { hashPassword } = require('../utils/password');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

// Role rank + who each role may create (down only).
// tenant_admin = the "Political Admin" / party lead (flowApplication.md §3);
// donor sits outside the main chain at party level (§9).
const RANK = { super_admin: 5, tenant_admin: 4, candidate: 3, admin: 2, sub_admin: 1, volunteer: 0, donor: 0 };
// The chain (each role assigns the one directly below it):
//   Political Admin → Candidate → Campaign Admin → Sub-admin → Volunteer
// The Political Admin also assigns party Donors. Super admin can bootstrap any.
const CREATABLE = {
    super_admin:  ['tenant_admin', 'candidate', 'admin', 'sub_admin', 'volunteer', 'donor'],
    tenant_admin: ['candidate', 'donor'],
    candidate:    ['admin', 'donor'],
    admin:        ['sub_admin'],
    sub_admin:    ['volunteer'],
    volunteer:    [],
    donor:        [],
};
// The region granularity a role is scoped to / assigned. tenant_admin and
// donor are PARTY-level: they get a user_parties grant, not a constituency one.
const REGION_OF = {
    tenant_admin: 'party', candidate: 'constituency', admin: 'constituency',
    sub_admin: 'ward', volunteer: 'voter_area', donor: 'party',
};
const PARTY_ROLES = new Set(['tenant_admin', 'donor']);

/**
 * Resolve which party a party-level user belongs to.
 * A Political Admin MUST come with a party: `party_id`, or `party_name`
 * (found case-insensitively, created if it doesn't exist yet — the name may be
 * Bangla, so the slug falls back to a generated id). Donors default to the
 * platform's party when none is given.
 */
async function resolveParty(req, targetRole) {
    const { party_id: partyId, party_name: partyName } = req.body || {};

    // A Political Admin always assigns within his OWN party — whatever the
    // request says (party isolation).
    if (!req.user?.is_super_admin) {
        const mine = callerPartyIds(req);
        if (mine.length) return mine[0];
        // A Candidate's party lives on his candidate grant, not user_parties —
        // his donors are anchored there, never to a party from the request.
        if (callerRole(req) === 'candidate') {
            const partyId = await candidatePartyId(req);
            if (!partyId) throw new ValidationError('Your candidate account has no party yet — ask your Political Admin');
            return partyId;
        }
    }

    if (partyId) {
        const p = await partyModel.findById(partyId);
        if (!p) throw new NotFoundError('Party not found');
        return p.party_id;
    }

    if (partyName?.trim()) {
        const name = partyName.trim();
        const existing = await partyModel.findByName(name);
        if (existing) return existing.party_id;
        // Slug from the name; Bangla names produce no ascii — generate an id.
        let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        if (!slug || await partyModel.findById(slug)) slug = `party-${Date.now().toString(36)}`;
        const created = await partyModel.create({ partyId: slug, name, createdBy: req.user.user_id });
        return created.party_id;
    }

    if (targetRole === 'tenant_admin') {
        throw new ValidationError('party_name is required — a Political Admin leads a political party');
    }
    // Donor without an explicit party → the platform's (single) party.
    const fallback = await one(
        `SELECT party_id FROM parties WHERE status = 'active' ORDER BY (party_id = 'default') DESC LIMIT 1`
    );
    if (!fallback) throw new ValidationError('No party exists yet');
    return fallback.party_id;
}

function callerRole(req) {
    return req.user?.is_super_admin ? 'super_admin' : (req.user?.role || null);
}

/** The party a Candidate belongs to — lives on his candidate grant. */
async function candidatePartyId(req) {
    const row = await one(
        `SELECT party_id FROM user_candidates
          WHERE user_id = $1 AND role = 'candidate' AND party_id IS NOT NULL
          LIMIT 1`,
        [req.user.user_id]
    );
    return row?.party_id || null;
}

/** The campaign (political candidate) the caller belongs to. Null for super-admin. */
function campaignId(req) {
    return req.user?.is_super_admin ? null : (req.user?.political_candidate_id || req.user?.user_id || null);
}

/** Party ids where the caller is the Political Admin (tenant_admin). */
function callerPartyIds(req) {
    return (req.user?.parties || [])
        .filter((p) => p.role === 'tenant_admin')
        .map((p) => p.id);
}

/** Constituencies the caller may assign within. */
function callerConstituencies(req) {
    if (req.user?.is_super_admin) return null; // all
    // A Political Admin registers his party's candidates on ANY seat —
    // constituencies are shared geography, party isolation lives on the grants.
    if (callerRole(req) === 'tenant_admin') return null;
    return (req.user?.candidates || []).map((g) => g.id);
}

/**
 * True when the target user belongs to the caller's OWN hierarchy. Rank alone
 * is not enough — Candidate A's team must never touch Candidate B's people
 * (data/user encapsulation is per campaign, per party).
 *  - campaign-axis callers (candidate/admin/sub_admin): the target must hold a
 *    grant on the caller's campaign;
 *  - Political Admin: the target must belong to one of his party's campaigns,
 *    be one of his party's candidates, or hold a party grant in his party.
 */
async function targetInScope(req, targetUserId) {
    if (req.user?.is_super_admin) return true;
    const role = callerRole(req);

    if (role === 'tenant_admin') {
        const partyIds = callerPartyIds(req);
        if (!partyIds.length) return false;
        const row = await one(
            `SELECT 1 AS ok
              WHERE EXISTS (
                    SELECT 1 FROM user_candidates uc
                     WHERE uc.user_id = $1
                       AND (uc.party_id = ANY($2)
                            OR uc.political_candidate_id IN (
                                SELECT uc2.user_id FROM user_candidates uc2
                                 WHERE uc2.role = 'candidate' AND uc2.party_id = ANY($2))))
                 OR EXISTS (
                    SELECT 1 FROM user_parties up
                     WHERE up.user_id = $1 AND up.party_id = ANY($2))`,
            [targetUserId, partyIds]
        );
        return !!row;
    }

    const cid = campaignId(req);
    if (!cid) return false;
    const row = await one(
        `SELECT 1 AS ok FROM user_candidates
          WHERE user_id = $1 AND political_candidate_id = $2 LIMIT 1`,
        [targetUserId, cid]
    );
    if (row) return true;

    // A Candidate also scopes the donors HE added (party-level grant, no
    // campaign row) — but never the Political Admin's or another candidate's.
    if (role === 'candidate') {
        const donor = await one(
            `SELECT 1 AS ok FROM user_parties
              WHERE user_id = $1 AND granted_by = $2 AND role = 'donor' LIMIT 1`,
            [targetUserId, req.user.user_id]
        );
        return !!donor;
    }
    return false;
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

    // Constituencies available to assign (null scope = all active).
    const mine = callerConstituencies(req);
    const all = await candidateModel.listActive();
    const constituencies = mine ? all.filter((c) => mine.includes(c.candidate_id)) : all;

    res.json({
        success: true,
        role,
        campaign_id: campaignId(req),
        my_parties: callerPartyIds(req),
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

    if (role === 'tenant_admin') {
        // PARTY ISOLATION: the Political Admin sees ONLY his own party — the
        // candidates his party registered plus everyone in those candidates'
        // campaigns (campaign admin → sub admin → volunteer all carry
        // political_candidate_id of a party candidate).
        const myParties = callerPartyIds(req);
        if (!myParties.length) throw new ForbiddenError('No party assigned to your account');
        params.push(myParties);
        const p = params.length;
        where.push(`(uc.party_id = ANY($${p}) OR uc.political_candidate_id IN (
            SELECT uc2.user_id FROM user_candidates uc2
             WHERE uc2.role = 'candidate' AND uc2.party_id = ANY($${p})))`);
    } else if (!req.user.is_super_admin) {
        // Campaign chain: locked to the caller's own campaign.
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

    // One row per (user, constituency, campaign): a volunteer serving two
    // candidates appears once under EACH campaign — that's the true hierarchy.
    // granted_by tells the client who added this person (sub-admin → volunteer).
    const rows = await many(
        `SELECT DISTINCT ON (u.user_id, uc.candidate_id, uc.political_candidate_id)
                u.user_id, u.username, u.name, u.email, u.phone, u.is_active,
                uc.candidate_id, uc.role, uc.allowed_wards, uc.allowed_voter_areas,
                uc.political_candidate_id, uc.party_id, pty.name AS party_name,
                pc.name AS political_candidate_name,
                uc.granted_by, gb.name AS granted_by_name, gb.role AS granted_by_role,
                c.name AS constituency_name
           FROM user_candidates uc
           JOIN users u ON u.user_id = uc.user_id
           JOIN candidates c ON c.candidate_id = uc.candidate_id
           LEFT JOIN users pc ON pc.user_id = uc.political_candidate_id
           LEFT JOIN users gb ON gb.user_id = uc.granted_by
           LEFT JOIN parties pty ON pty.party_id = uc.party_id
          WHERE ${where.join(' AND ')}
          ORDER BY u.user_id, uc.candidate_id, uc.political_candidate_id, uc.role`,
        params
    );

    // Party-level users (Political Admins / Donors) hold user_parties grants,
    // not constituency grants — append the ones ranked below the caller,
    // limited to the caller's own party for Political Admins.
    const partyRolesBelow = ['tenant_admin', 'donor'].filter((r) => RANK[r] < RANK[role]);
    if (partyRolesBelow.length && (role === 'super_admin' || role === 'tenant_admin')) {
        const partyRows = await partyModel.listPartyUsers({
            roles: partyRolesBelow,
            partyIds: role === 'tenant_admin' ? callerPartyIds(req) : null,
        });
        rows.push(...partyRows);
    } else if (role === 'candidate') {
        // A Candidate sees his party's full donor list (donors are party-level
        // and fund any of the party's volunteers) — but may edit/remove only
        // the ones HE added; the rest stay the Political Admin's to manage.
        const partyId = await candidatePartyId(req);
        if (partyId) {
            rows.push(...await partyModel.listPartyUsers({
                roles: ['donor'], partyIds: [partyId],
            }));
        }
    }

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

    // ---- Party-level roles (Political Admin / Donor): no constituency grant —
    // they get a user_parties row instead (flowApplication.md §3/§9). ----
    if (PARTY_ROLES.has(targetRole)) {
        const partyId = await resolveParty(req, targetRole);

        let target;
        if (existingUserId) {
            target = await userModel.findById(parseInt(existingUserId, 10));
            if (!target) throw new NotFoundError('User not found');
        } else {
            if (!name || !username || !password) {
                throw new ValidationError('name, username and password are required');
            }
            target = await userModel.create({
                username, email: email || null, name,
                passwordHash: await hashPassword(password),
                role: targetRole, phone: phone || null, referredBy: req.user.user_id,
            });
        }
        await partyModel.grantPartyRole({
            userId: target.user_id, partyId, role: targetRole, grantedBy: req.user.user_id,
        });
        return res.status(201).json({ success: true, user: target });
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

    // Resolve or create the user. Attaching an EXISTING user (e.g. a volunteer
    // already working for another candidate) only adds a grant — the account
    // must already carry the same role, or the roles would silently diverge.
    let target;
    if (existingUserId) {
        target = await userModel.findById(parseInt(existingUserId, 10));
        if (!target) throw new NotFoundError('User not found');
        if (target.role !== targetRole) {
            throw new ValidationError(`@${target.username} is a ${target.role}, not a ${targetRole}`);
        }
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

    // Campaign axis per role:
    //  - a CANDIDATE is their own campaign, and their grant carries the PARTY
    //    that registered them (the Political Admin's party — this is what
    //    party isolation hangs off);
    //  - everyone else inherits the caller's campaign (candidate → admin →
    //    sub admin → volunteer all share the candidate's id).
    let politicalCandidateId;
    let grantPartyId = null;
    if (targetRole === 'candidate') {
        politicalCandidateId = target.user_id;
        if (req.user.is_super_admin) {
            grantPartyId = req.body.party_id || 'default';
        } else {
            grantPartyId = callerPartyIds(req)[0] || null;
            if (!grantPartyId) throw new ForbiddenError('No party assigned to your account');
        }
    } else {
        politicalCandidateId = req.user.is_super_admin
            ? (req.body.political_candidate_id || null)
            : campaignId(req);
    }

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
            partyId: grantPartyId,
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
    if (!(await targetInScope(req, parseInt(req.params.user_id, 10)))) {
        throw new ForbiddenError('User is outside your hierarchy');
    }

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

/**
 * PUT /api/management/users/:user_id — update a managed user's basic info
 * (name / email / phone / active flag, optional password reset). Region and
 * role changes go through PUT /users/:user_id/region.
 */
async function updateUser(req, res) {
    const role = callerRole(req);
    if (!role || role === 'volunteer' || role === 'donor') {
        throw new ForbiddenError('You cannot manage users');
    }
    const uid = parseInt(req.params.user_id, 10);
    const target = await userModel.findById(uid);
    if (!target) throw new NotFoundError('User not found');
    if (uid !== req.user.user_id && RANK[target.role] >= RANK[role]) {
        throw new ForbiddenError('Cannot edit a user at or above your level');
    }
    if (uid !== req.user.user_id && !(await targetInScope(req, uid))) {
        throw new ForbiddenError('User is outside your hierarchy');
    }
    // Same lock-out risk as delete: deactivating or resetting the Main Admin
    // from a hijacked/other session would cut off platform access. Only the
    // Main Admin edits their own account.
    if (target.is_super_admin && uid !== req.user.user_id) {
        throw new ForbiddenError('The Main Admin account can only be edited by itself');
    }

    const { name, email, phone, is_active, password } = req.body || {};
    // Only pass provided fields — userModel.update would null out the rest.
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (email !== undefined) fields.email = email || null;
    if (phone !== undefined) fields.phone = phone || null;
    if (is_active !== undefined) fields.is_active = !!is_active;

    const user = await userModel.update(uid, fields);
    if (password) {
        await userModel.updatePassword(uid, await hashPassword(password), true);
    }
    res.json({ success: true, user });
}

/**
 * DELETE /api/management/users/:user_id
 * Super admin: hard delete. Everyone else DETACHES the user from their own
 * hierarchy only — a volunteer shared with another candidate keeps that
 * candidate's grant (and their login); the account is deleted only once no
 * grant anywhere references it.
 */
async function removeUser(req, res) {
    const role = callerRole(req);
    if (!role || role === 'volunteer' || role === 'donor') throw new ForbiddenError('You cannot delete users');
    const uid = parseInt(req.params.user_id, 10);
    if (uid === req.user.user_id) throw new ForbiddenError('Cannot delete yourself');

    const target = await userModel.findById(uid);
    if (!target) throw new NotFoundError('User not found');
    // RANK is role-based and the platform admin's role column is plain 'admin' —
    // the super flag lives beside it, so it must be checked explicitly or the
    // Main Admin account is deletable and the whole platform gets locked out.
    if (target.is_super_admin) throw new ForbiddenError('The Main Admin account cannot be deleted');
    if (RANK[target.role] >= RANK[role]) throw new ForbiddenError('Cannot delete a user at or above your level');

    if (req.user.is_super_admin) {
        await userModel.remove(uid);
        return res.json({ success: true });
    }
    if (!(await targetInScope(req, uid))) throw new ForbiddenError('User is outside your hierarchy');

    if (role === 'tenant_admin') {
        const partyIds = callerPartyIds(req);
        await query(
            `DELETE FROM user_candidates
              WHERE user_id = $1
                AND (party_id = ANY($2)
                     OR political_candidate_id IN (
                        SELECT uc2.user_id FROM user_candidates uc2
                         WHERE uc2.role = 'candidate' AND uc2.party_id = ANY($2)))`,
            [uid, partyIds]
        );
        await query(`DELETE FROM user_parties WHERE user_id = $1 AND party_id = ANY($2)`, [uid, partyIds]);
    } else {
        await query(
            `DELETE FROM user_candidates WHERE user_id = $1 AND political_candidate_id = $2`,
            [uid, campaignId(req)]
        );
        // A Candidate detaching a donor removes only the party grant HE issued.
        if (role === 'candidate') {
            await query(
                `DELETE FROM user_parties WHERE user_id = $1 AND granted_by = $2 AND role = 'donor'`,
                [uid, req.user.user_id]
            );
        }
    }

    const [grants, parties] = await Promise.all([
        candidateModel.listForUser(uid),
        partyModel.listForUser(uid),
    ]);
    if (grants.length === 0 && parties.length === 0) await userModel.remove(uid);
    res.json({ success: true, removed: grants.length === 0 && parties.length === 0 });
}

module.exports = { context, wards, voterAreas, listUsers, createUser, updateUser, updateRegion, removeUser };
