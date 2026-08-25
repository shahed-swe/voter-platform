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

/**
 * POST /api/canvassing/voter-locations
 * Body: { scope: { ward: [..], voter_area: [..] } } (values may be a string or array)
 * Returns every voter in the scope whose latest canvass carries a geolocation —
 * the canvassing map shows them all as pins at once.
 */
async function voterLocations(req, res) {
    const { scope = {} } = req.body || {};
    const toArr = (v) => (v == null || v === '' ? null : (Array.isArray(v) ? v : [v]).filter(Boolean));
    let wards = toArr(scope.ward);
    let areas = toArr(scope.voter_area);

    // Same volunteer restrictions as the voter list (#12): only allowed wards /
    // voter areas may be requested; no scope defaults to everything they hold.
    const allowedWards = req.user?.allowed_wards;
    if (allowedWards?.length) {
        wards = wards ? wards.filter((w) => allowedWards.includes(w)) : allowedWards;
        if (!wards.length) throw new ForbiddenError('Ward not in your allowed wards');
    }
    const allowedAreas = req.user?.allowed_voter_areas;
    if (allowedAreas?.length) {
        areas = areas ? areas.filter((a) => allowedAreas.includes(a)) : allowedAreas;
        if (!areas.length) throw new ForbiddenError('Voter area not in your allowed areas');
    }

    const rows = await canvassingModel.voterLocationsByScope(tenant(req), {
        wards,
        voterAreas: areas,
        politicalCandidateId: pcId(req),
    });
    res.json({ success: true, voters: rows });
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
    voterLocations,
    voterRecords,
    stats,
};
