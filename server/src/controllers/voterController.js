const voterModel = require('../models/voterModel');
const candidateModel = require('../models/candidateModel');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function getById(req, res) {
    const voter = await voterModel.findById(tenant(req), req.params.voter_id);
    if (!voter) throw new NotFoundError('Voter not found');
    res.json({ success: true, voter });
}

async function search(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const voters = await voterModel.search(tenant(req), req.params.query, { limit });
    res.json({ success: true, voters });
}

async function byVillage(req, res) {
    const { village_id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1000;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const voters = await voterModel.byVillage(tenant(req), village_id, { limit, offset });
    res.json({ success: true, voters });
}

async function byVoterArea(req, res) {
    const voters = await voterModel.byVoterArea(tenant(req), req.params.voter_area, {
        limit: parseInt(req.query.limit || 1000, 10),
        offset: parseInt(req.query.offset || 0, 10),
    });
    res.json({ success: true, voters });
}

async function byVoterAreas(req, res) {
    const { areas = [], status, search, limit, offset } = req.body || {};
    const result = await voterModel.byVoterAreas(tenant(req), {
        areas,
        status,
        search,
        limit: limit ? parseInt(limit, 10) : 500,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, ...result });
}

async function listVoterAreas(req, res) {
    res.json({ success: true, voter_areas: await voterModel.listVoterAreas(tenant(req)) });
}

async function voterAreaStats(req, res) {
    const stats = await voterModel.voterAreaStats(tenant(req), req.params.voter_area);
    res.json({ success: true, stats });
}

async function aggregatedStats(req, res) {
    const groupBy = req.body?.group_by || 'union';
    const stats = await voterModel.aggregatedStatistics(tenant(req), { groupBy });
    res.json({ success: true, stats });
}

/**
 * POST /api/voters/filtered
 *   Body: { filters: { upazila: [...], union: ['X'], mauza: 'Y', ... }, status, search, limit, offset }
 * Filter keys are validated against the candidate's filter_config so callers
 * can only filter by attributes the candidate is configured for.
 */
async function filtered(req, res) {
    const candidateId = tenant(req);
    const { filters = {}, status, search, limit, offset } = req.body || {};

    // Validate keys against candidate.filter_config
    const candidate = await candidateModel.findById(candidateId);
    const specs = candidate?.filter_config || [];
    const allowed = new Set(specs.map((f) => f.key));
    for (const key of Object.keys(filters)) {
        if (!allowed.has(key)) {
            throw new ValidationError(`Filter '${key}' is not configured for this candidate`);
        }
    }

    const result = await voterModel.findByFilters(candidateId, {
        filters,
        specs,   // lets the model resolve attribute-backed (voters_attr) filters
        status,
        search,
        limit: limit ? Math.min(parseInt(limit, 10) || 500, 2000) : 500,
        offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, ...result });
}

/** GET /api/voters/attribute-keys — distinct voter attribute columns for the filter designer */
async function attributeKeys(req, res) {
    res.json({ success: true, keys: await voterModel.attributeKeys(tenant(req)) });
}

module.exports = {
    getById,
    search,
    byVillage,
    byVoterArea,
    byVoterAreas,
    filtered,
    listVoterAreas,
    voterAreaStats,
    aggregatedStats,
    attributeKeys,
};
