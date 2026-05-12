const { one, many } = require('../db/pool');

async function create(candidateId, { canvassId, voterId, fileType, mimeType, fileName, filePath, size, durationSeconds }) {
    return one(
        `INSERT INTO media_files (
            candidate_id,
            canvass_id, voter_id, file_type, mime_type, file_name,
            file_path, original_size, compressed_size, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [candidateId, canvassId, voterId, fileType, mimeType, fileName, filePath, size, size, durationSeconds || null]
    );
}

async function findById(candidateId, mediaId) {
    return one(
        `SELECT * FROM media_files WHERE candidate_id = $1 AND media_id = $2`,
        [candidateId, mediaId]
    );
}

async function byCanvass(candidateId, canvassId) {
    return many(
        `SELECT * FROM media_files WHERE candidate_id = $1 AND canvass_id = $2 ORDER BY created_at DESC`,
        [candidateId, canvassId]
    );
}

async function byVoter(candidateId, voterId) {
    return many(
        `SELECT * FROM media_files WHERE candidate_id = $1 AND voter_id = $2 ORDER BY created_at DESC`,
        [candidateId, voterId]
    );
}

async function remove(candidateId, mediaId) {
    return one(
        `DELETE FROM media_files WHERE candidate_id = $1 AND media_id = $2 RETURNING file_path`,
        [candidateId, mediaId]
    );
}

async function removeByCanvass(candidateId, canvassId, fileType) {
    return many(
        `DELETE FROM media_files WHERE candidate_id = $1 AND canvass_id = $2 AND file_type = $3
         RETURNING file_path`,
        [candidateId, canvassId, fileType]
    );
}

module.exports = { create, findById, byCanvass, byVoter, remove, removeByCanvass };
