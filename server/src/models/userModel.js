const { query, one, many } = require('../db/pool');

const PUBLIC_FIELDS = `user_id, username, email, name, role, is_active, password_changed,
                       is_super_admin, phone, address, referred_by, created_at, updated_at`;

async function findById(userId) {
    return one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE user_id = $1`, [userId]);
}

async function findByUsername(username) {
    return one(`SELECT user_id, username, email, name, role, is_active, password_changed, password_hash
                  FROM users WHERE username = $1`, [username]);
}

async function findByUsernameOrEmail(identifier) {
    return one(
        `SELECT user_id, username, email, name, role, is_active, password_changed, password_hash
           FROM users WHERE username = $1 OR email = $1
           LIMIT 1`,
        [identifier]
    );
}

/**
 * List users granted access to the given candidate. Returns the user + their
 * per-candidate role from user_candidates.
 */
async function list(candidateId, { role, isActive, search, limit = 100, offset = 0 } = {}) {
    const where = ['uc.candidate_id = $1'];
    const params = [candidateId];

    if (role) {
        params.push(role);
        where.push(`uc.role = $${params.length}`);
    }
    if (isActive !== undefined) {
        params.push(isActive);
        where.push(`u.is_active = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`(u.username ILIKE $${i} OR u.email ILIKE $${i} OR u.name ILIKE $${i})`);
    }
    params.push(limit);
    params.push(offset);

    const sql = `
        SELECT u.user_id, u.username, u.email, u.name, uc.role,
               u.is_active, u.password_changed, u.is_super_admin,
               u.phone, u.address, u.referred_by, u.created_at, u.updated_at
          FROM user_candidates uc
          JOIN users u ON u.user_id = uc.user_id
          WHERE ${where.join(' AND ')}
          ORDER BY u.user_id DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    return many(sql, params);
}

async function create({ username, email, name, passwordHash, role, phone, address, referredBy }) {
    const row = await one(
        `INSERT INTO users (username, email, name, password_hash, role, phone, address, referred_by, password_changed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
         RETURNING ${PUBLIC_FIELDS}`,
        [username, email, name, passwordHash, role, phone || null, address || null, referredBy || null]
    );
    return row;
}

async function update(userId, fields) {
    const allowed = ['email', 'name', 'role', 'phone', 'address', 'is_active'];
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) {
            params.push(v);
            sets.push(`${k} = $${params.length}`);
        }
    }
    if (!sets.length) return findById(userId);
    sets.push(`updated_at = NOW()`);
    params.push(userId);
    const sql = `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${params.length}
                 RETURNING ${PUBLIC_FIELDS}`;
    return one(sql, params);
}

async function updatePassword(userId, passwordHash, markChanged = true) {
    return one(
        `UPDATE users
            SET password_hash = $1,
                password_changed = $2,
                updated_at = NOW()
          WHERE user_id = $3
        RETURNING ${PUBLIC_FIELDS}`,
        [passwordHash, markChanged, userId]
    );
}

async function updateUsername(userId, username) {
    return one(
        `UPDATE users SET username = $1, updated_at = NOW() WHERE user_id = $2
         RETURNING ${PUBLIC_FIELDS}`,
        [username, userId]
    );
}

async function remove(userId) {
    const { rowCount } = await query(`DELETE FROM users WHERE user_id = $1`, [userId]);
    return rowCount > 0;
}

async function listByRole(role) {
    return many(
        `SELECT ${PUBLIC_FIELDS} FROM users WHERE role = $1 AND is_active = true ORDER BY name`,
        [role]
    );
}

/** Find users by partial username/name match — for "select existing volunteer" UI. */
async function searchAll({ search, limit = 20 } = {}) {
    const params = [`%${search || ''}%`];
    return many(
        `SELECT ${PUBLIC_FIELDS} FROM users
          WHERE (name ILIKE $1 OR username ILIKE $1)
            AND is_active = true
          ORDER BY name
          LIMIT $2`,
        [params[0], limit]
    );
}

module.exports = {
    findById,
    findByUsername,
    findByUsernameOrEmail,
    list,
    listByRole,
    searchAll,
    create,
    update,
    updatePassword,
    updateUsername,
    remove,
};
