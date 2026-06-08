const m = require('../models/genericGeoModel');
const geoLayer = require('../models/geoLayerModel');
const { ForbiddenError, ValidationError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('No candidate selected');
    return req.candidateId;
}

// ---- geo_layers store (generic, wizard-onboarded candidates) ----

/** GET /api/layers/geo/:layer_key — all features of a generic layer */
async function geoLayerAll(req, res) {
    res.json(await geoLayer.fetchLayer(tenant(req), req.params.layer_key));
}

/** GET /api/layers/geo/:layer_key/by/:parent_feature_id — children of a parent */
async function geoLayerByParent(req, res) {
    res.json(
        await geoLayer.fetchLayerByParent(
            tenant(req),
            req.params.layer_key,
            req.params.parent_feature_id
        )
    );
}

/** GET /api/geo/:source — all features for source, scoped to candidate */
async function listAll(req, res) {
    try {
        res.json(await m.fetch(tenant(req), req.params.source));
    } catch (err) {
        throw new ValidationError(err.message);
    }
}

/**
 * GET /api/geo/:source/by/:parent_fk/:parent_value
 *   Returns features of source where parent_fk = parent_value (and candidate matches).
 */
async function listByParent(req, res) {
    try {
        res.json(
            await m.fetch(tenant(req), req.params.source, {
                parent_fk: req.params.parent_fk,
                parent_value: req.params.parent_value,
            })
        );
    } catch (err) {
        throw new ValidationError(err.message);
    }
}

/** GET /api/geo/sources — discoverability for the wizard */
function listSources(_req, res) {
    const out = {};
    for (const [k, v] of Object.entries(m.SOURCES)) {
        out[k] = {
            id_col:        v.id_col,
            property_cols: v.property_cols,
            parent_fks:    v.parent_fks,
            geometry:      v.geom_col ? 'polygon' : v.synthesize_point_geom ? 'point' : 'unknown',
        };
    }
    res.json({ success: true, sources: out });
}

module.exports = { listAll, listByParent, listSources, geoLayerAll, geoLayerByParent };
