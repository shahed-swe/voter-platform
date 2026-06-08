const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const parsers = require('../services/ingest/parsers');
const { ingestGeoLayer } = require('../services/ingest/geoLayerIngest');
const candidateModel = require('../models/candidateModel');
const layerDefModel = require('../models/layerDefinitionModel');
const { ForbiddenError, ValidationError, NotFoundError } = require('../utils/errors');

// Uploaded onboarding files live here briefly, keyed by an upload token, until
// the operator finishes mapping + ingesting. Not the same as media uploads.
const STAGE_DIR = path.join(config.uploads.dir, 'ingest');
if (!fs.existsSync(STAGE_DIR)) fs.mkdirSync(STAGE_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAGE_DIR),
    filename: (_req, file, cb) => {
        const token = crypto.randomBytes(12).toString('hex');
        // Preserve original extension so the parser can detect format
        const ext = path.extname(file.originalname) || '';
        cb(null, `${token}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB — voter CSVs can be large
});

function requireSuper(req) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');
}

/**
 * POST /api/ingest/upload   (multipart, field "file")
 * Stores the file + returns a preview (format, columns, first rows, total).
 * The returned `upload_token` is used by /ingest/commit.
 */
async function uploadAndPreview(req, res) {
    requireSuper(req);
    if (!req.file) throw new ValidationError('No file uploaded (field "file")');

    const filePath = req.file.path;
    const buf = fs.readFileSync(filePath);
    let pv;
    try {
        pv = await parsers.preview(buf, req.file.originalname, 5);
    } catch (err) {
        tryUnlink(filePath);
        throw new ValidationError(`Could not parse file: ${err.message}`);
    }

    res.json({
        success: true,
        upload_token: path.basename(filePath),   // the staged filename
        original_name: req.file.originalname,
        ...pv,
    });
}

/**
 * POST /api/ingest/commit
 * Body: {
 *   upload_token, original_name,
 *   layer_key, parent_layer_key?, mapping: {...}
 * }
 * Re-parses the staged file and ingests it into geo_layers for the active candidate.
 */
async function commit(req, res) {
    requireSuper(req);
    const candidateId = req.candidateId;
    if (!candidateId) throw new ForbiddenError('Pick a candidate first');

    const { upload_token, original_name, layer_key, parent_layer_key, mapping } = req.body || {};
    if (!upload_token || !layer_key || !mapping) {
        throw new ValidationError('upload_token, layer_key and mapping are required');
    }

    const candidate = await candidateModel.findById(candidateId);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const filePath = path.join(STAGE_DIR, path.basename(upload_token)); // basename guards traversal
    if (!fs.existsSync(filePath)) throw new NotFoundError('Upload expired or not found; re-upload');

    const buf = fs.readFileSync(filePath);
    const parsed = await parsers.parseFile(buf, original_name || upload_token);

    const { inserted } = await ingestGeoLayer({
        candidateId,
        layerKey: layer_key,
        parentLayerKey: parent_layer_key || null,
        rows: parsed.rows,
        mapping,
    });

    tryUnlink(filePath); // clean up staged file after successful ingest

    // Keep candidates.map_config in sync so the new/updated layer shows on the
    // map immediately (no separate "publish" step). Best-effort — a missing
    // layer_definitions catalog just means nothing to regenerate yet.
    let map_config;
    try {
        map_config = await layerDefModel.regenerateMapConfig(candidateId);
    } catch (err) {
        console.warn('[ingest] map_config regenerate skipped:', err.message);
    }

    res.json({ success: true, layer_key, inserted, map_config });
}

function tryUnlink(p) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
}

module.exports = { upload, uploadAndPreview, commit };
