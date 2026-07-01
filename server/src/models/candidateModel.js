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

/** Returns the array of {candidate_id, role, allowed_wards, political_candidate_id} the user has access to. */
async function listForUser(userId) {
    return many(
        `SELECT uc.candidate_id, uc.role, uc.allowed_wards, uc.political_candidate_id,
                c.name, c.constituency, c.title, c.subtitle
           FROM user_candidates uc
           JOIN candidates c ON c.candidate_id = uc.candidate_id
          WHERE uc.user_id = $1 AND c.status = 'active'
          ORDER BY c.name`,
        [userId]
    );
}

async function userHasAccess(userId, candidateId) {
    const r = await one(
        `SELECT role, allowed_wards, political_candidate_id
           FROM user_candidates WHERE user_id = $1 AND candidate_id = $2`,
        [userId, candidateId]
    );
    return r || null;
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

async function grantUserAccess({ userId, candidateId, role, grantedBy, allowedWards, politicalCandidateId }) {
    await query(
        `INSERT INTO user_candidates (user_id, candidate_id, role, granted_by, allowed_wards, political_candidate_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, candidate_id) DO UPDATE
           SET role = EXCLUDED.role,
               allowed_wards = EXCLUDED.allowed_wards,
               political_candidate_id = EXCLUDED.political_candidate_id`,
        [userId, candidateId, role, grantedBy || null, allowedWards || null, politicalCandidateId || null]
    );
}

/** List all users (with their role) assigned to a constituency, optionally filtered by political_candidate_id. */
async function listUsersForConstituency(candidateId, { politicalCandidateId } = {}) {
    const params = [candidateId];
    let extra = '';
    if (politicalCandidateId != null) {
        params.push(politicalCandidateId);
        extra = `AND uc.political_candidate_id = $${params.length}`;
    }
    return many(
        `SELECT uc.user_id, uc.role, uc.allowed_wards, uc.political_candidate_id,
                u.name, u.username, u.email, u.phone, u.is_active
           FROM user_candidates uc
           JOIN users u ON u.user_id = uc.user_id
          WHERE uc.candidate_id = $1 ${extra}
          ORDER BY uc.role, u.name`,
        params
    );
}

async function revokeUserAccess(userId, candidateId) {
    const { rowCount } = await query(
        `DELETE FROM user_candidates WHERE user_id = $1 AND candidate_id = $2`,
        [userId, candidateId]
    );
    return rowCount > 0;
}

/**
 * Remove all 'candidate'-role grants for a user except (optionally) one to keep.
 * Used when re-assigning a political candidate to a single constituency so they
 * never accumulate stale assignments.
 */
async function revokeCandidateGrants(userId, exceptCandidateId = null) {
    const params = [userId];
    let extra = '';
    if (exceptCandidateId != null) {
        params.push(exceptCandidateId);
        extra = `AND candidate_id <> $${params.length}`;
    }
    await query(
        `DELETE FROM user_candidates WHERE user_id = $1 AND role = 'candidate' ${extra}`,
        params
    );
}

async function updateFilterConfig(candidateId, filterConfig) {
    return one(
        `UPDATE candidates SET filter_config = $2::jsonb, updated_at = NOW()
          WHERE candidate_id = $1
        RETURNING ${PUBLIC_FIELDS}`,
        [candidateId, JSON.stringify(filterConfig || [])]
    );
}

/**
 * Hard-delete a candidate and ALL its data. Every data table carries a
 * candidate_id FK with ON DELETE CASCADE, so voters / villages / wards /
 * voter_areas / buildings / polling_stations / canvassing / geo_layers /
 * layer_definitions / user_candidates rows all go with it.
 */
async function remove(candidateId) {
    const { rowCount } = await query(
        `DELETE FROM candidates WHERE candidate_id = $1`,
        [candidateId]
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
    revokeCandidateGrants,
    updateFilterConfig,
    remove,
    listUsersForConstituency,
};
