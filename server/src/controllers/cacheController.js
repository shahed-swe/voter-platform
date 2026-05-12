const filterCache = require('../services/filterCacheService');
const { ForbiddenError } = require('../utils/errors');

function status(_req, res) {
    res.json({ success: true, ...filterCache.status() });
}

function clear(req, res) {
    if (req.user.role !== 'admin') throw new ForbiddenError();
    filterCache.invalidate();
    res.json({ success: true, message: 'Cache cleared' });
}

module.exports = { status, clear };
