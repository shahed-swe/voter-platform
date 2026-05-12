const villageModel = require('../models/villageModel');
const filterCache = require('../services/filterCacheService');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function filters(req, res) {
    const t = tenant(req);
    const key = `filters:${t}:${req.user?.user_id || 0}`;
    let data = filterCache.get(key);
    if (!data) {
        data = await villageModel.listFilters(t);
        filterCache.set(key, data);
    }
    res.json({ success: true, ...data });
}

async function listFiltered(req, res) {
    const { upazila, union, mauza, limit, offset } = req.body || {};
    const rows = await villageModel.listWithFilters(tenant(req), {
        upazila,
        union,
        mauza,
        limit: limit ? parseInt(limit, 10) : 1000,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, villages: rows });
}

async function listData(req, res) {
    const villages = await villageModel.listWithFilters(tenant(req));
    res.json({ success: true, villages });
}

async function withVoters(req, res) {
    // regionService.buildRegionFilter still relies on user_assignments;
    // for now don't apply role-based region filtering when the controller
    // doesn't have it wired through MT cleanly. The candidate scope is the
    // primary boundary; sub-admin / volunteer restriction is layered on top
    // later (phase 11).
    const rows = await villageModel.withVoterCounts(tenant(req));
    res.json({ success: true, villages: rows });
}

async function stats(req, res) {
    const stats = await villageModel.statsOverview(tenant(req));
    res.json({ success: true, stats });
}

async function geometry(req, res) {
    const ids = Array.isArray(req.body?.village_ids) ? req.body.village_ids : [];
    const rows = await villageModel.geometryFor(tenant(req), ids);
    res.json({ success: true, villages: rows });
}

async function getById(req, res) {
    const village = await villageModel.findById(tenant(req), req.params.village_id);
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
