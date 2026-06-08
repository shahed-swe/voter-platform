const layerDefModel = require('../models/layerDefinitionModel');
const candidateModel = require('../models/candidateModel');
const { ForbiddenError, ValidationError } = require('../utils/errors');

function tenant(req) {
    if (!req.candidateId) throw new ForbiddenError('Pick a candidate first');
    return req.candidateId;
}
function requireSuper(req) {
    if (!req.user?.is_super_admin) throw new ForbiddenError('Super-admin only');
}

/** GET /api/layer-definitions — the active candidate's layer catalog */
async function list(req, res) {
    res.json({ success: true, layers: await layerDefModel.list(tenant(req)) });
}

/**
 * PUT /api/layer-definitions
 * Body: { layers: [ { layer_key, display_name, parent_layer_key, geometry_type,
 *                     is_leaf, click_action, color_by, style } ] }
 * Replaces the whole catalog and regenerates candidates.map_config.
 */
async function replaceAll(req, res) {
    requireSuper(req);
    const { layers } = req.body || {};
    if (!Array.isArray(layers)) throw new ValidationError('layers must be an array');

    // basic validation: unique keys, parent references exist
    const keys = new Set();
    for (const l of layers) {
        if (!l.layer_key || !/^[a-z][a-z0-9_]*$/i.test(l.layer_key)) {
            throw new ValidationError(`invalid layer_key: ${l.layer_key}`);
        }
        if (keys.has(l.layer_key)) throw new ValidationError(`duplicate layer_key: ${l.layer_key}`);
        keys.add(l.layer_key);
    }
    for (const l of layers) {
        if (l.parent_layer_key && !keys.has(l.parent_layer_key)) {
            throw new ValidationError(`layer "${l.layer_key}" references unknown parent "${l.parent_layer_key}"`);
        }
    }

    const mapConfig = await layerDefModel.replaceAll(tenant(req), layers);
    res.json({ success: true, map_config: mapConfig });
}

/**
 * PUT /api/layer-definitions/filters
 * Body: { filters: [ { key, label, type, source, value_col, ... } ] }
 * Saves candidate.filter_config (drives the left-panel filters). Lets an
 * operator add/remove filters without re-importing voters.
 */
async function saveFilters(req, res) {
    requireSuper(req);
    const { filters } = req.body || {};
    if (!Array.isArray(filters)) throw new ValidationError('filters must be an array');
    const keys = new Set();
    for (const f of filters) {
        if (!f.key) throw new ValidationError('each filter needs a key');
        if (keys.has(f.key)) throw new ValidationError(`duplicate filter key: ${f.key}`);
        keys.add(f.key);
    }
    const candidate = await candidateModel.updateFilterConfig(tenant(req), filters);
    res.json({ success: true, filter_config: candidate.filter_config });
}

module.exports = { list, replaceAll, saveFilters };
