'use strict';
const { one, many } = require('../db/pool');

// Party-level grants (user_parties): tenant_admin (Political Admin / party
// lead) and donor sit at PARTY level, outside the constituency grant chain.
// This model starts minimal — it grows as the party layer lands
// (docs/application-flows/plan.md Step 2).

/** Case-insensitive lookup by display name (for find-or-create flows). */
async function findByName(name) {
    return one(
        `SELECT party_id, name, status FROM parties WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [name]
    );
}

async function findById(partyId) {
    return one(`SELECT party_id, name, status FROM parties WHERE party_id = $1`, [partyId]);
}

/** All active parties — feeds the party-name autocomplete in user creation. */
async function listActive() {
    return many(`SELECT party_id, name FROM parties WHERE status = 'active' ORDER BY name`);
}

async function create({ partyId, name, createdBy }) {
    return one(
        `INSERT INTO parties (party_id, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING party_id, name, status`,
        [partyId, name, createdBy || null]
    );
}

/** Party grants held by a user: [{ party_id, role, party_name }]. */
async function listForUser(userId) {
    return many(
        `SELECT up.party_id, up.role, p.name AS party_name
           FROM user_parties up
           JOIN parties p ON p.party_id = up.party_id
          WHERE up.user_id = $1 AND p.status = 'active'
          ORDER BY p.name`,
        [userId]
    );
}

async function grantPartyRole({ userId, partyId, role, grantedBy }) {
    return one(
        `INSERT INTO user_parties (user_id, party_id, role, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, party_id, role) DO UPDATE SET granted_by = EXCLUDED.granted_by
         RETURNING id, user_id, party_id, role`,
        [userId, partyId, role, grantedBy || null]
    );
}

async function revokePartyRole(userId, partyId, role) {
    const r = await one(
        `DELETE FROM user_parties WHERE user_id = $1 AND party_id = $2 AND role = $3
         RETURNING id`,
        [userId, partyId, role]
    );
    return !!r;
}

/** Users holding party-level grants, for the management list. */
async function listPartyUsers({ roles = null, partyIds = null, grantedBy = null } = {}) {
    const params = [];
    const where = [`u.is_active = true`];
    if (roles?.length) {
        params.push(roles);
        where.push(`up.role = ANY($${params.length})`);
    }
    if (partyIds?.length) {
        params.push(partyIds);
        where.push(`up.party_id = ANY($${params.length})`);
    }
    if (grantedBy != null) {
        params.push(grantedBy);
        where.push(`up.granted_by = $${params.length}`);
    }
    return many(
        `SELECT u.user_id, u.username, u.name, u.email, u.phone, u.is_active,
                up.role, up.party_id, p.name AS party_name,
                up.granted_by, gb.name AS granted_by_name, gb.role AS granted_by_role
           FROM user_parties up
           JOIN users u   ON u.user_id  = up.user_id
           JOIN parties p ON p.party_id = up.party_id
           LEFT JOIN users gb ON gb.user_id = up.granted_by
          WHERE ${where.join(' AND ')}
          ORDER BY up.role, u.name`,
        params
    );
}

module.exports = {
    findById, findByName, create,
    listActive, listForUser, grantPartyRole, revokePartyRole, listPartyUsers,
};
