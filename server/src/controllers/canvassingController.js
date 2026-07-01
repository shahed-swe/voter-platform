const canvassingModel = require('../models/canvassingModel');
const { ValidationError, ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

// The political candidate whose survey data the caller may read. For a candidate
// user this is their own id; for a volunteer it's the candidate they're acting
// for; for a super-admin it's null (sees the whole constituency).
function pcId(req) {
    return req.user?.political_candidate_id || null;
}

async function submit(req, res) {
    const { voter_id, ...rest } = req.body || {};
    if (!voter_id) throw new ValidationError('voter_id is required');

    const canvass = await canvassingModel.submit(tenant(req), {
        voterId: voter_id,
        userId: req.user.user_id,
        politicalCandidateId: req.user.political_candidate_id || null,
        payload: rest,
    });
    res.status(201).json({ success: true, canvass });
}

async function history(req, res) {
    const rows = await canvassingModel.historyForVoter(tenant(req), req.params.voter_id, pcId(req));
    res.json({ success: true, history: rows });
}

async function locationsByVillage(req, res) {
    const rows = await canvassingModel.locationsByVillage(tenant(req), req.params.village_id, pcId(req));
    res.json({ success: true, locations: rows });
}

async function allLocations(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5000;
    const rows = await canvassingModel.allLocations(tenant(req), { limit, politicalCandidateId: pcId(req) });
    res.json({ success: true, locations: rows });
}

async function voterRecords(req, res) {
    const rows = await canvassingModel.listVoterRecords(tenant(req), {
        limit: parseInt(req.query.limit || 200, 10),
        offset: parseInt(req.query.offset || 0, 10),
        search: req.query.q || null,
        politicalCandidateId: pcId(req),
    });
    res.json({ success: true, records: rows });
}

async function stats(req, res) {
    res.json({ success: true, stats: await canvassingModel.stats(tenant(req), pcId(req)) });
}

module.exports = {
    submit,
    history,
    locationsByVillage,
    allLocations,
    voterRecords,
    stats,
};
