const m = require('../models/geoModel');
const { ForbiddenError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

async function villages(req, res) {
    res.json(await m.villagesGeojson(tenant(req)));
}
async function voterAreas(req, res) {
    res.json(
        await m.voterAreasGeojson(tenant(req), {
            wardId: req.query.ward_id,
            unionName: req.query.union,
            mauzaName: req.query.mauza,
        })
    );
}
async function buildings(req, res) {
    res.json(await m.buildingsGeojson(tenant(req), req.params.voter_area_id));
}
async function wards(req, res) {
    res.json(await m.wardsGeojson(tenant(req)));
}

module.exports = { villages, voterAreas, buildings, wards };
