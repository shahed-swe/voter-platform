const m = require('../models/geoModel');

async function villages(_req, res) {
    res.json(await m.villagesGeojson());
}
async function voterAreas(req, res) {
    res.json(
        await m.voterAreasGeojson({
            wardId: req.query.ward_id,
            unionName: req.query.union,
            mauzaName: req.query.mauza,
        })
    );
}
async function buildings(req, res) {
    res.json(await m.buildingsGeojson(req.params.voter_area_id));
}
async function wards(_req, res) {
    res.json(await m.wardsGeojson());
}

module.exports = { villages, voterAreas, buildings, wards };
