const config = require('../config');

module.exports = function corsMiddleware(req, res, next) {
    const origin = req.get('origin');
    const allowed = config.cors.allowedOrigins;
    const isAllowed = allowed.length === 0 || allowed.includes(origin);

    if (isAllowed || !origin) {
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
};
