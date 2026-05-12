const { query, one, many } = require('../db/pool');

async function create({ canvassId, voterId, fileType, mimeType, fileName, filePath, size, durationSeconds }) {
    return one(
        `INSERT INTO media_files (
            canvass_id, voter_id, file_type, mime_type, file_name,
            file_path, original_size, compressed_size, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [canvassId, voterId, fileType, mimeType, fileName, filePath, size, size, durationSeconds || null]
    );
}

async function findById(mediaId) {
    return one(`SELECT * FROM media_files WHERE media_id = $1`, [mediaId]);
}

async function byCanvass(canvassId) {
    return many(`SELECT * FROM media_files WHERE canvass_id = $1 ORDER BY created_at DESC`, [canvassId]);
}

async function byVoter(voterId) {
    return many(`SELECT * FROM media_files WHERE voter_id = $1 ORDER BY created_at DESC`, [voterId]);
}

async function remove(mediaId) {
    const row = await one(`DELETE FROM media_files WHERE media_id = $1 RETURNING file_path`, [mediaId]);
    return row;
}

async function removeByCanvass(canvassId, fileType) {
    const rows = await many(
        `DELETE FROM media_files WHERE canvass_id = $1 AND file_type = $2 RETURNING file_path`,
        [canvassId, fileType]
    );
    return rows;
}

module.exports = { create, findById, byCanvass, byVoter, remove, removeByCanvass };
