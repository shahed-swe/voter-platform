const { query, one, many } = require('../db/pool');

const PUBLIC_FIELDS = `user_id, username, email, name, role, is_active, password_changed,
                       phone, address, referred_by, created_at, updated_at`;

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

async function list({ role, isActive, search, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (role) {
        params.push(role);
        where.push(`role = $${params.length}`);
    }
    if (isActive !== undefined) {
        params.push(isActive);
        where.push(`is_active = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        where.push(`(username ILIKE $${i} OR email ILIKE $${i} OR name ILIKE $${i})`);
    }
    params.push(limit);
    params.push(offset);
    const sql = `SELECT ${PUBLIC_FIELDS} FROM users
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY user_id DESC
                 LIMIT $${params.length - 1} OFFSET $${params.length}`;
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

module.exports = {
    findById,
    findByUsername,
    findByUsernameOrEmail,
    list,
    create,
    update,
    updatePassword,
    updateUsername,
    remove,
};
