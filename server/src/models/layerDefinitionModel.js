// CRUD for layer_definitions — the per-candidate catalog of map layers the
// wizard designs. candidates.map_config.layers is GENERATED from these rows
// (see regenerateMapConfig) so the live map always reflects the catalog.

const { many, one, query, withTransaction } = require('../db/pool');

const COLS = `candidate_id, layer_key, display_name, display_name_bn, parent_layer_key,
              ordinal, geometry_type, is_leaf, click_action, color_by, style,
              row_count, created_at, updated_at`;

async function list(candidateId) {
    return many(
        `SELECT ${COLS} FROM layer_definitions
          WHERE candidate_id = $1 ORDER BY ordinal, layer_key`,
        [candidateId]
    );
}

/**
 * Replace the whole layer catalog for a candidate in one transaction, then
 * regenerate candidates.map_config from it. `layers` is the ordered array the
 * wizard produces.
 */
async function replaceAll(candidateId, layers) {
    return withTransaction(async (client) => {
        await client.query('DELETE FROM layer_definitions WHERE candidate_id = $1', [candidateId]);

        let ordinal = 0;
        for (const l of layers) {
            await client.query(
                `INSERT INTO layer_definitions
                   (candidate_id, layer_key, display_name, display_name_bn, parent_layer_key,
                    ordinal, geometry_type, is_leaf, click_action, color_by, style)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
                [
                    candidateId,
                    l.layer_key,
                    l.display_name || l.layer_key,
                    l.display_name_bn || null,
                    l.parent_layer_key || null,
                    ordinal++,
                    l.geometry_type === 'point' ? 'point' : 'polygon',
                    !!l.is_leaf,
                    l.click_action || (l.is_leaf ? 'select' : 'drill'),
                    l.color_by || 'uniform',
                    JSON.stringify(l.style || {}),
                ]
            );
        }

        const mapConfig = await buildMapConfig(client, candidateId);
        await client.query(
            `UPDATE candidates SET map_config = $2::jsonb, updated_at = NOW()
              WHERE candidate_id = $1`,
            [candidateId, JSON.stringify(mapConfig)]
        );

        return mapConfig;
    });
}

/**
 * Translate layer_definitions rows → the map_config.layers array consumed by
 * <DynamicMap>. Generic (geo_layers-backed) layers get `source: "geo:<key>"`.
 */
async function buildMapConfig(client, candidateId) {
    const { rows } = await client.query(
        `SELECT * FROM layer_definitions WHERE candidate_id = $1 ORDER BY ordinal, layer_key`,
        [candidateId]
    );

    const layers = rows.map((r) => {
        const layer = {
            id:         r.layer_key,
            source:     `geo:${r.layer_key}`,   // generic store
            parent:     r.parent_layer_key || null,
            // For geo: sources the child is fetched by parent_feature_id, so the
            // explicit parent_fk used by table-sources isn't needed; DynamicMap's
            // geo path ignores it. We still record the parent for clarity.
            parent_fk:  r.parent_layer_key ? 'parent_feature_id' : undefined,
            label_from: 'name',
            click:      r.click_action || (r.is_leaf ? 'select' : 'drill'),
            color_by:   r.color_by || 'uniform',
            style:      r.style || {},
        };
        if (r.color_by === 'bucket') {
            layer.bucket_field   = (r.style && r.style.bucket_field) || 'total_population';
            layer.buckets        = (r.style && r.style.buckets) || [0, 2000, 5000, 10000, 15000];
            layer.bucket_palette = (r.style && r.style.bucket_palette) ||
                ['#E8F5E9', '#A5D6A7', '#66BB6A', '#2E7D32', '#1B5E20'];
        }
        return layer;
    });

    // Preserve any non-layers keys already on the candidate (center, zoom, right_panel)
    const existing = await client.query(
        `SELECT map_config FROM candidates WHERE candidate_id = $1`, [candidateId]
    );
    const prev = existing.rows[0]?.map_config || {};
    return {
        ...prev,
        layers,
    };
}

/** Public helper: regenerate map_config without changing the catalog (e.g. after import). */
async function regenerateMapConfig(candidateId) {
    return withTransaction(async (client) => {
        const mapConfig = await buildMapConfig(client, candidateId);
        await client.query(
            `UPDATE candidates SET map_config = $2::jsonb, updated_at = NOW() WHERE candidate_id = $1`,
            [candidateId, JSON.stringify(mapConfig)]
        );
        return mapConfig;
    });
}

module.exports = { list, replaceAll, regenerateMapConfig };
