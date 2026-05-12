const { query, one, many } = require('../db/pool');

async function listForUser(candidateId, userId) {
    return many(
        `SELECT ua.*, v.village_name, v.upazila, v."union" AS union_name, v.mauza, v.total_population
           FROM user_assignments ua
           LEFT JOIN villages v ON v.village_id = ua.village_id AND v.candidate_id = $1
          WHERE ua.candidate_id = $1 AND ua.user_id = $2
          ORDER BY ua.assignment_id DESC`,
        [candidateId, userId]
    );
}

async function create(candidateId, { userId, assignedBy, type, value, villageId, notes }) {
    return one(
        `INSERT INTO user_assignments
            (candidate_id, user_id, assigned_by_user_id, assignment_type, assignment_value, village_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [candidateId, userId, assignedBy || null, type, value, villageId || null, notes || null]
    );
}

async function removeOne(candidateId, assignmentId, userId) {
    const { rowCount } = await query(
        `DELETE FROM user_assignments
          WHERE candidate_id = $1 AND assignment_id = $2 AND user_id = $3`,
        [candidateId, assignmentId, userId]
    );
    return rowCount > 0;
}

async function removeAllForUser(candidateId, userId) {
    await query(
        `DELETE FROM user_assignments WHERE candidate_id = $1 AND user_id = $2`,
        [candidateId, userId]
    );
}

async function listAll(candidateId, { assignmentType } = {}) {
    if (assignmentType) {
        return many(
            `SELECT ua.*, u.name AS user_name, u.username, u.email, u.phone, u.role
               FROM user_assignments ua
               JOIN users u ON u.user_id = ua.user_id
              WHERE ua.candidate_id = $1 AND ua.assignment_type = $2
              ORDER BY ua.assignment_id DESC`,
            [candidateId, assignmentType]
        );
    }
    return many(
        `SELECT ua.*, u.name AS user_name, u.username, u.email, u.phone, u.role
           FROM user_assignments ua
           JOIN users u ON u.user_id = ua.user_id
          WHERE ua.candidate_id = $1
          ORDER BY ua.assignment_id DESC`,
        [candidateId]
    );
}

module.exports = { listForUser, create, removeOne, removeAllForUser, listAll };
