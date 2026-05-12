const { query, one, many } = require('../db/pool');

async function listForUser(userId) {
    return many(
        `SELECT ua.*, v.village_name, v.upazila, v."union" AS union_name, v.mauza, v.total_population
           FROM user_assignments ua
           LEFT JOIN villages v ON v.village_id = ua.village_id
          WHERE ua.user_id = $1
          ORDER BY ua.assignment_id DESC`,
        [userId]
    );
}

async function create({ userId, assignedBy, type, value, villageId, notes }) {
    return one(
        `INSERT INTO user_assignments (user_id, assigned_by_user_id, assignment_type, assignment_value, village_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, assignedBy || null, type, value, villageId || null, notes || null]
    );
}

async function removeOne(assignmentId, userId) {
    const { rowCount } = await query(
        `DELETE FROM user_assignments WHERE assignment_id = $1 AND user_id = $2`,
        [assignmentId, userId]
    );
    return rowCount > 0;
}

async function removeAllForUser(userId) {
    await query(`DELETE FROM user_assignments WHERE user_id = $1`, [userId]);
}

async function listAll({ assignmentType } = {}) {
    if (assignmentType) {
        return many(
            `SELECT ua.*, u.name AS user_name, u.username, u.email, u.phone, u.role
               FROM user_assignments ua
               JOIN users u ON u.user_id = ua.user_id
              WHERE ua.assignment_type = $1
              ORDER BY ua.assignment_id DESC`,
            [assignmentType]
        );
    }
    return many(
        `SELECT ua.*, u.name AS user_name, u.username, u.email, u.phone, u.role
           FROM user_assignments ua
           JOIN users u ON u.user_id = ua.user_id
          ORDER BY ua.assignment_id DESC`
    );
}

module.exports = { listForUser, create, removeOne, removeAllForUser, listAll };
