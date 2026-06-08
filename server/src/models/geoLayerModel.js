// Generic read access to the geo_layers store. Powers the config-driven map
// for candidates onboarded through the wizard (any layer type, no per-type
// table). Always scoped to one candidate.

const { many, one } = require('../db/pool');

// Columns surfaced as feature.properties (props JSONB is merged on top).
const BASE_COLS = [
    'feature_id', 'layer_key', 'parent_layer_key', 'parent_feature_id',
    'name', 'code', 'total_population', 'male_count', 'female_count',
    'latitude', 'longitude',
];

function rowToFeature(row) {
    const { geometry, props, latitude, longitude, ...rest } = row;
    // Polygon layers carry geometry; point layers may only carry lat/lng.
    let geom = geometry || null;
    if (!geom && latitude != null && longitude != null) {
        geom = { type: 'Point', coordinates: [longitude, latitude] };
    }
    return {
        type: 'Feature',
        geometry: geom,
        properties: { ...(props || {}), ...rest, latitude, longitude },
    };
}

function toFeatureCollection(rows) {
    return {
        type: 'FeatureCollection',
        features: rows.filter((r) => r.geometry || (r.latitude != null && r.longitude != null))
                      .map(rowToFeature),
    };
}

/** Root layer: all features of `layerKey` for the candidate. */
async function fetchLayer(candidateId, layerKey) {
    const rows = await many(
        `SELECT ${BASE_COLS.join(', ')}, geometry, props
           FROM geo_layers
          WHERE candidate_id = $1 AND layer_key = $2`,
        [candidateId, layerKey]
    );
    return toFeatureCollection(rows);
}

/** Children of a parent feature: features of `layerKey` whose parent_feature_id matches. */
async function fetchLayerByParent(candidateId, layerKey, parentFeatureId) {
    const rows = await many(
        `SELECT ${BASE_COLS.join(', ')}, geometry, props
           FROM geo_layers
          WHERE candidate_id = $1 AND layer_key = $2 AND parent_feature_id = $3`,
        [candidateId, layerKey, parentFeatureId]
    );
    return toFeatureCollection(rows);
}

/** Aggregate stats for a layer (used by right-panel widgets). */
async function layerStats(candidateId, layerKey, { parentFeatureId } = {}) {
    const params = [candidateId, layerKey];
    let where = 'candidate_id = $1 AND layer_key = $2';
    if (parentFeatureId) {
        params.push(parentFeatureId);
        where += ` AND parent_feature_id = $3`;
    }
    return one(
        `SELECT COUNT(*)::int                    AS feature_count,
                COALESCE(SUM(total_population),0) AS total_population,
                COALESCE(SUM(male_count),0)       AS male_count,
                COALESCE(SUM(female_count),0)     AS female_count
           FROM geo_layers
          WHERE ${where}`,
        params
    );
}

module.exports = { fetchLayer, fetchLayerByParent, layerStats };
