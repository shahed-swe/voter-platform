const m = require('../models/urbanModel');
const { ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function constituencies(req, res) {
    res.json({ success: true, constituencies: await m.listConstituencies(tenant(req)) });
}
async function wards(req, res) {
    res.json({
        success: true,
        wards: await m.listWards(tenant(req), { constituencyId: req.query.constituency_id }),
    });
}
async function voterAreas(req, res) {
    res.json({
        success: true,
        voter_areas: await m.listVoterAreas(tenant(req), { wardId: req.query.ward_id }),
    });
}
async function buildingsForVoterArea(req, res) {
    res.json({
        success: true,
        buildings: await m.buildingsForVoterArea(tenant(req), req.params.voterAreaName),
    });
}
async function buildingsVisited(req, res) {
    res.json({ success: true, ...(await m.buildingVisitedCount(tenant(req), req.params.voterAreaId)) });
}
async function canvassedVotersForBuilding(req, res) {
    res.json({
        success: true,
        voters: await m.canvassedVotersForBuilding(tenant(req), req.params.building_id),
    });
}
async function pollingStations(req, res) {
    res.json({
        success: true,
        polling_stations: await m.pollingStations(tenant(req), { wardId: req.params.wardId }),
    });
}
async function pollingStationsFilter(req, res) {
    res.json({ success: true, polling_stations: await m.pollingStations(tenant(req)) });
}
async function hierarchy(req, res) {
    res.json({ success: true, hierarchy: await m.hierarchy(tenant(req)) });
}

module.exports = {
    constituencies,
    wards,
    voterAreas,
    buildingsForVoterArea,
    buildingsVisited,
    canvassedVotersForBuilding,
    pollingStations,
    pollingStationsFilter,
    hierarchy,
};
