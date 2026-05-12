const m = require('../models/urbanModel');

async function constituencies(_req, res) {
    res.json({ success: true, constituencies: await m.listConstituencies() });
}
async function wards(req, res) {
    res.json({ success: true, wards: await m.listWards({ constituencyId: req.query.constituency_id }) });
}
async function voterAreas(req, res) {
    res.json({ success: true, voter_areas: await m.listVoterAreas({ wardId: req.query.ward_id }) });
}
async function buildingsForVoterArea(req, res) {
    res.json({
        success: true,
        buildings: await m.buildingsForVoterArea(req.params.voterAreaName),
    });
}
async function buildingsGeojson(req, res) {
    res.json(await m.buildingsGeojson(req.params.voterAreaName));
}
async function buildingsVisited(req, res) {
    res.json({ success: true, ...(await m.buildingVisitedCount(req.params.voterAreaId)) });
}
async function canvassedVotersForBuilding(req, res) {
    res.json({
        success: true,
        voters: await m.canvassedVotersForBuilding(req.params.building_id),
    });
}
async function pollingStations(req, res) {
    res.json({ success: true, polling_stations: await m.pollingStations({ wardId: req.params.wardId }) });
}
async function pollingStationsFilter(_req, res) {
    res.json({ success: true, polling_stations: await m.pollingStations() });
}
async function hierarchy(_req, res) {
    res.json({ success: true, hierarchy: await m.hierarchy() });
}

module.exports = {
    constituencies,
    wards,
    voterAreas,
    buildingsForVoterArea,
    buildingsGeojson,
    buildingsVisited,
    canvassedVotersForBuilding,
    pollingStations,
    pollingStationsFilter,
    hierarchy,
};
