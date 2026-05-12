const canvassingModel = require('../models/canvassingModel');
const { ValidationError } = require('../utils/errors');

async function submit(req, res) {
    const { voter_id, ...rest } = req.body || {};
    if (!voter_id) throw new ValidationError('voter_id is required');

    const canvass = await canvassingModel.submit({
        voterId: voter_id,
        userId: req.user.user_id,
        payload: rest,
    });
    res.status(201).json({ success: true, canvass });
}

async function history(req, res) {
    const rows = await canvassingModel.historyForVoter(req.params.voter_id);
    res.json({ success: true, history: rows });
}

async function locationsByVillage(req, res) {
    const rows = await canvassingModel.locationsByVillage(req.params.village_id);
    res.json({ success: true, locations: rows });
}

async function allLocations(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5000;
    const rows = await canvassingModel.allLocations({ limit });
    res.json({ success: true, locations: rows });
}

async function voterRecords(req, res) {
    const rows = await canvassingModel.listVoterRecords({
        limit: parseInt(req.query.limit || 200, 10),
        offset: parseInt(req.query.offset || 0, 10),
    });
    res.json({ success: true, records: rows });
}

async function stats(_req, res) {
    const s = await canvassingModel.stats();
    res.json({ success: true, stats: s });
}

module.exports = {
    submit,
    history,
    locationsByVillage,
    allLocations,
    voterRecords,
    stats,
};
