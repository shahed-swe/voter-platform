// Writes parsed rows into geo_layers for one candidate + layer.
// Driven by a `mapping` produced by the column-mapping UI.

const { pool } = require('../../db/pool');
const { geometryBboxCenter } = require('../../utils/geometry');

/**
 * mapping shape:
 * {
 *   feature_id:        "<sourceCol>",   // required — unique id within layer; if
 *                                       //   omitted we auto-number 1..N
 *   name:              "<sourceCol>",   // optional display label
 *   code:              "<sourceCol>",
 *   parent_feature_id: "<sourceCol>",   // optional — links to parent layer
 *   total_population:  "<sourceCol>",
 *   male_count:        "<sourceCol>",
 *   female_count:      "<sourceCol>",
 *   latitude:          "<sourceCol>",   // for point layers without geometry
 *   longitude:         "<sourceCol>",
 * }
 * Every UNMAPPED source column is preserved in props (JSONB).
 */

const MAPPABLE_NUM = ['total_population', 'male_count', 'female_count'];
const MAPPABLE_FLOAT = ['latitude', 'longitude'];
const MAPPABLE_TEXT = ['feature_id', 'name', 'code', 'parent_feature_id', 'parent_layer_key'];

function num(v) {
    if (v == null || v === '') return null;
    const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
}
function flt(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
}

async function ingestGeoLayer({
    candidateId, layerKey, parentLayerKey, rows, mapping,
    parentFeatureIdFixed = null,   // when set, ALL rows get this parent_feature_id
    parentMatcher = null,          // fn(childGeom)→parentFeatureId for spatial linking
    batchSize = 500,
}) {
    const mappedCols = new Set(Object.values(mapping).filter(Boolean));
    const client = await pool.connect();
    let inserted = 0;
    let matched = 0, unmatched = 0;   // spatial-link tally
    try {
        await client.query('BEGIN');
        // Replace any prior data for this candidate+layer (idempotent re-import)
        await client.query(
            'DELETE FROM geo_layers WHERE candidate_id = $1 AND layer_key = $2',
            [candidateId, layerKey]
        );

        for (let start = 0; start < rows.length; start += batchSize) {
            const batch = rows.slice(start, start + batchSize);
            const values = [];
            const tuples = [];
            batch.forEach((row, idx) => {
                const get = (key) => (mapping[key] ? row[mapping[key]] : null);

                const featureId = mapping.feature_id
                    ? String(get('feature_id') ?? '')
                    : String(start + idx + 1);

                // props = every source column not consumed by a mapping, minus geometry
                const props = {};
                for (const [k, v] of Object.entries(row)) {
                    if (k === '__geometry__') continue;
                    if (mappedCols.has(k)) continue;
                    props[k] = v;
                }

                const geometry = row.__geometry__ ? JSON.stringify(row.__geometry__) : null;

                // Resolve parent_feature_id: spatial match > fixed value > column > null
                let parentFid;
                if (parentMatcher) {
                    parentFid = parentMatcher(row.__geometry__);
                    if (parentFid) matched++; else unmatched++;
                } else if (parentFeatureIdFixed != null && parentFeatureIdFixed !== '') {
                    parentFid = String(parentFeatureIdFixed);
                } else {
                    parentFid = mapping.parent_feature_id ? String(get('parent_feature_id') ?? '') || null : null;
                }

                // Centroid columns: mapped source values win; otherwise derive the
                // bbox center from the geometry so spatial lookups (e.g. the
                // GPS→building canvass snap) can prefilter on plain lat/lng.
                let latVal = flt(get('latitude'));
                let lngVal = flt(get('longitude'));
                if ((latVal == null || lngVal == null) && row.__geometry__) {
                    const center = geometryBboxCenter(row.__geometry__);
                    if (center) [latVal, lngVal] = center;
                }

                const tupleVals = [
                    candidateId,
                    layerKey,
                    featureId || String(start + idx + 1),
                    parentLayerKey || null,
                    parentFid,
                    mapping.name ? String(get('name') ?? '') || null : null,
                    mapping.code ? String(get('code') ?? '') || null : null,
                    num(get('total_population')),
                    num(get('male_count')),
                    num(get('female_count')),
                    latVal,
                    lngVal,
                    geometry,
                    JSON.stringify(props),
                ];
                const base = values.length;
                tuples.push(
                    `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},` +
                    `$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},` +
                    `$${base + 13}::jsonb,$${base + 14}::jsonb)`
                );
                values.push(...tupleVals);
            });

            await client.query(
                `INSERT INTO geo_layers
                   (candidate_id, layer_key, feature_id, parent_layer_key, parent_feature_id,
                    name, code, total_population, male_count, female_count,
                    latitude, longitude, geometry, props)
                 VALUES ${tuples.join(',')}
                 ON CONFLICT (candidate_id, layer_key, feature_id) DO NOTHING`,
                values
            );
            inserted += batch.length;
        }

        // Update the layer_definitions row_count if the catalog row exists
        await client.query(
            `UPDATE layer_definitions SET row_count = $3, updated_at = NOW()
              WHERE candidate_id = $1 AND layer_key = $2`,
            [candidateId, layerKey, inserted]
        );

        await client.query('COMMIT');
        return { inserted, matched, unmatched };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { ingestGeoLayer, MAPPABLE_NUM, MAPPABLE_FLOAT, MAPPABLE_TEXT };
