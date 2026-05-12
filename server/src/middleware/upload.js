const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');

const photosDir = path.join(config.uploads.dir, 'photos');
const audioDir = path.join(config.uploads.dir, 'audio');

[photosDir, audioDir].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const AUDIO_EXT = {
    'audio/webm': '.webm',
    'audio/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
};

const IMAGE_EXT = {
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
};

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        cb(null, req.body.file_type === 'audio' ? audioDir : photosDir);
    },
    filename: (req, file, cb) => {
        const { canvass_id, voter_id, file_type } = req.body;
        const ts = Date.now();
        const ext =
            file_type === 'audio'
                ? AUDIO_EXT[file.mimetype] || '.wav'
                : IMAGE_EXT[file.mimetype] || '.jpg';
        cb(null, `canvass_${canvass_id}_voter_${voter_id}_${ts}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: config.uploads.maxBytes },
    fileFilter: (req, file, cb) => {
        const ft = req.body.file_type;
        if (ft === 'photo' && !file.mimetype.startsWith('image/')) {
            return cb(new Error('Photo must be an image file'));
        }
        if (ft === 'audio' && !file.mimetype.startsWith('audio/')) {
            return cb(new Error('Audio must be an audio file'));
        }
        cb(null, true);
    },
});

module.exports = { upload, photosDir, audioDir };
