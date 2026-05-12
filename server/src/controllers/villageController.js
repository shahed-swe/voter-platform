const villageModel = require('../models/villageModel');
const filterCache = require('../services/filterCacheService');
const { buildRegionFilter } = require('../services/regionService');
const { NotFoundError } = require('../utils/errors');

async function filters(req, res) {
    const key = `filters:${req.user?.role || 'guest'}:${req.user?.user_id || 0}`;
    let data = filterCache.get(key);
    if (!data) {
        data = await villageModel.listFilters();
        filterCache.set(key, data);
    }
    res.json({ success: true, ...data });
}

async function listFiltered(req, res) {
    const { upazila, union, mauza, limit, offset } = req.body || {};
    const rows = await villageModel.listWithFilters({
        upazila,
        union,
        mauza,
        limit: limit ? parseInt(limit, 10) : 1000,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, villages: rows });
}

async function listData(_req, res) {
    const villages = await villageModel.listWithFilters();
    res.json({ success: true, villages });
}

async function withVoters(req, res) {
    const { sql, params } = await buildRegionFilter(req.user.user_id, req.user.role, {
        startIdx: 1,
        voterAlias: 'v',
    });
    const rows = await villageModel.withVoterCounts({
        regionFilterSql: sql,
        regionFilterParams: params,
    });
    res.json({ success: true, villages: rows });
}

async function stats(_req, res) {
    const stats = await villageModel.statsOverview();
    res.json({ success: true, stats });
}

async function geometry(req, res) {
    const ids = Array.isArray(req.body?.village_ids) ? req.body.village_ids : [];
    const rows = await villageModel.geometryFor(ids);
    res.json({ success: true, villages: rows });
}

async function getById(req, res) {
    const village = await villageModel.findById(req.params.village_id);
    if (!village) throw new NotFoundError('Village not found');
    res.json({ success: true, village });
}

module.exports = {
    filters,
    listFiltered,
    listData,
    withVoters,
    stats,
    geometry,
    getById,
};
