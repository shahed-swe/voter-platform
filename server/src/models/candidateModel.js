const { one, many, query } = require('../db/pool');

const PUBLIC_FIELDS = `candidate_id, name, constituency, title, subtitle, logo_url,
                       theme, filter_config, map_config, status, created_at, updated_at`;

async function findById(candidateId) {
    return one(`SELECT ${PUBLIC_FIELDS} FROM candidates WHERE candidate_id = $1`, [candidateId]);
}

async function listActive() {
    return many(`SELECT ${PUBLIC_FIELDS} FROM candidates WHERE status = 'active' ORDER BY name`);
}

async function listAll() {
    return many(`SELECT ${PUBLIC_FIELDS} FROM candidates ORDER BY name`);
}

/** Returns the array of {candidate_id, role} the user has access to. */
async function listForUser(userId) {
    return many(
        `SELECT uc.candidate_id, uc.role, c.name, c.constituency, c.title, c.subtitle
           FROM user_candidates uc
           JOIN candidates c ON c.candidate_id = uc.candidate_id
          WHERE uc.user_id = $1 AND c.status = 'active'
          ORDER BY c.name`,
        [userId]
    );
}

async function userHasAccess(userId, candidateId) {
    const r = await one(
        `SELECT role FROM user_candidates WHERE user_id = $1 AND candidate_id = $2`,
        [userId, candidateId]
    );
    return r?.role || null;
}

async function create({ candidateId, name, constituency, title, subtitle, logoUrl, theme, filterConfig, mapConfig, createdBy }) {
    return one(
        `INSERT INTO candidates (
            candidate_id, name, constituency, title, subtitle, logo_url, theme,
            filter_config, map_config, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING ${PUBLIC_FIELDS}`,
        [
            candidateId, name, constituency, title, subtitle,
            logoUrl || null, theme || null,
            JSON.stringify(filterConfig || []),
            JSON.stringify(mapConfig || {}),
            createdBy || null,
        ]
    );
}

async function grantUserAccess({ userId, candidateId, role, grantedBy }) {
    await query(
        `INSERT INTO user_candidates (user_id, candidate_id, role, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, candidate_id) DO UPDATE SET role = EXCLUDED.role`,
        [userId, candidateId, role, grantedBy || null]
    );
}

async function revokeUserAccess(userId, candidateId) {
    const { rowCount } = await query(
        `DELETE FROM user_candidates WHERE user_id = $1 AND candidate_id = $2`,
        [userId, candidateId]
    );
    return rowCount > 0;
}

module.exports = {
    findById,
    listActive,
    listAll,
    listForUser,
    userHasAccess,
    create,
    grantUserAccess,
    revokeUserAccess,
};
