const voterModel = require('../models/voterModel');
const { NotFoundError } = require('../utils/errors');

async function getById(req, res) {
    const voter = await voterModel.findById(req.params.voter_id);
    if (!voter) throw new NotFoundError('Voter not found');
    res.json({ success: true, voter });
}

async function search(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const voters = await voterModel.search(req.params.query, { limit });
    res.json({ success: true, voters });
}

async function byVillage(req, res) {
    const { village_id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1000;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const voters = await voterModel.byVillage(village_id, { limit, offset });
    res.json({ success: true, voters });
}

async function byVoterArea(req, res) {
    const voters = await voterModel.byVoterArea(req.params.voter_area, {
        limit: parseInt(req.query.limit || 1000, 10),
        offset: parseInt(req.query.offset || 0, 10),
    });
    res.json({ success: true, voters });
}

async function listVoterAreas(_req, res) {
    const areas = await voterModel.listVoterAreas();
    res.json({ success: true, voter_areas: areas });
}

async function voterAreaStats(req, res) {
    const stats = await voterModel.voterAreaStats(req.params.voter_area);
    res.json({ success: true, stats });
}

async function aggregatedStats(req, res) {
    const groupBy = req.body?.group_by || 'union';
    const stats = await voterModel.aggregatedStatistics({ groupBy });
    res.json({ success: true, stats });
}

module.exports = {
    getById,
    search,
    byVillage,
    byVoterArea,
    listVoterAreas,
    voterAreaStats,
    aggregatedStats,
};
