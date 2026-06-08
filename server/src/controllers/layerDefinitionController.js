const layerDefModel = require('../models/layerDefinitionModel');
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

module.exports = { list, replaceAll };
