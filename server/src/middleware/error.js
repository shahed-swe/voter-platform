const multer = require('multer');
const { AppError } = require('../utils/errors');

function notFound(_req, res) {
    res.status(404).json({ success: false, error: 'Not found' });
}

function errorHandler(err, _req, res, _next) {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }

    if (err instanceof AppError) {
        const body = { success: false, error: err.message, code: err.code };
        if (err.details) body.details = err.details;
        return res.status(err.status).json(body);
    }

    console.error('[error]', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
}

module.exports = { notFound, errorHandler };
