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

    // Postgres unique-violation — surface a readable message instead of a bare 500.
    // (#16: creating a user with an existing username showed "Internal server error".)
    if (err && err.code === '23505') {
        const isUsername = /username/i.test(err.constraint || err.detail || '');
        return res.status(409).json({
            success: false,
            error: isUsername
                ? 'এই username আগে থেকেই ব্যবহৃত হয়েছে — অন্য একটি username দিন।'
                : 'This value already exists (duplicate).',
            code: 'DUPLICATE',
        });
    }

    console.error('[error]', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
}

module.exports = { notFound, errorHandler };
