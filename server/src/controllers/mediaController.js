const fs = require('fs');
const path = require('path');
const mediaModel = require('../models/mediaModel');
const config = require('../config');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function upload(req, res) {
    const { canvass_id, voter_id, file_type, duration_seconds } = req.body;

    if (!canvass_id || !voter_id || !file_type || !req.file) {
        if (req.file) tryUnlink(req.file.path);
        throw new ValidationError('Missing required fields (canvass_id, voter_id, file_type, file)');
    }
    if (!['photo', 'audio'].includes(file_type)) {
        tryUnlink(req.file.path);
        throw new ValidationError('Invalid file_type');
    }

    const subdir = file_type === 'audio' ? 'audio' : 'photos';
    const filePath = `/${subdir}/${req.file.filename}`;

    const row = await mediaModel.create(tenant(req), {
        canvassId: canvass_id,
        voterId: voter_id,
        fileType: file_type,
        mimeType: req.file.mimetype,
        fileName: req.file.originalname,
        filePath,
        size: req.file.size,
        durationSeconds: duration_seconds ? parseInt(duration_seconds, 10) : null,
    });

    res.json({
        success: true,
        media_id: row.media_id,
        file_path: filePath,
        file_name: req.file.filename,
        message: `${file_type} uploaded successfully`,
    });
}

async function getById(req, res) {
    const media = await mediaModel.findById(tenant(req), req.params.media_id);
    if (!media) throw new NotFoundError('Media not found');
    res.json({ success: true, media });
}

async function byCanvass(req, res) {
    res.json({ success: true, media: await mediaModel.byCanvass(tenant(req), req.params.canvass_id) });
}

async function byVoter(req, res) {
    res.json({ success: true, media: await mediaModel.byVoter(tenant(req), req.params.voter_id) });
}

async function serve(req, res) {
    const media = await mediaModel.findById(tenant(req), req.params.media_id);
    if (!media) throw new NotFoundError('Media not found');
    const fullPath = path.join(config.uploads.dir, media.file_path.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) throw new NotFoundError('File missing on disk');
    res.setHeader('Content-Type', media.mime_type);
    fs.createReadStream(fullPath).pipe(res);
}

async function deletePhoto(req, res) {
    const rows = await mediaModel.removeByCanvass(tenant(req), req.params.canvass_id, 'photo');
    rows.forEach((r) => tryUnlink(path.join(config.uploads.dir, r.file_path.replace(/^\//, ''))));
    res.json({ success: true, deleted: rows.length });
}

async function deleteAudio(req, res) {
    const rows = await mediaModel.removeByCanvass(tenant(req), req.params.canvass_id, 'audio');
    rows.forEach((r) => tryUnlink(path.join(config.uploads.dir, r.file_path.replace(/^\//, ''))));
    res.json({ success: true, deleted: rows.length });
}

function tryUnlink(p) {
    try {
        if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
        console.error('[media] unlink failed:', err.message);
    }
}

module.exports = { upload, getById, byCanvass, byVoter, serve, deletePhoto, deleteAudio };
