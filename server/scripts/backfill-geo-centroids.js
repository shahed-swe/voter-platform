#!/usr/bin/env node
// One-time backfill: geo_layers rows imported before centroid derivation have
// geometry but NULL latitude/longitude. Compute each geometry's bbox center
// (same formula as ingest + the client's getBounds().getCenter()) and store it,
// so spatial lookups like the GPS→building canvass snap can prefilter on
// plain lat/lng. Safe to re-run: only touches rows where latitude IS NULL.
//
// Usage: node scripts/backfill-geo-centroids.js

const { pool } = require('../src/db/pool');
const { geometryBboxCenter } = require('../src/utils/geometry');

const SELECT_BATCH = 2000;

async function main() {
    let updated = 0;
    let skipped = 0;
    for (;;) {
        const { rows } = await pool.query(
            `SELECT candidate_id, layer_key, feature_id, geometry
               FROM geo_layers
              WHERE latitude IS NULL AND geometry IS NOT NULL
              LIMIT $1`,
            [SELECT_BATCH]
        );
        if (!rows.length) break;

        const values = [];
        const tuples = [];
        for (const row of rows) {
            const center = geometryBboxCenter(row.geometry);
            if (!center) { skipped++; continue; }
            const base = values.length;
            tuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4}::float8,$${base + 5}::float8)`);
            values.push(row.candidate_id, row.layer_key, row.feature_id, center[0], center[1]);
        }
        if (!tuples.length) {
            // Every remaining row has degenerate geometry — nothing left to do.
            if (rows.length < SELECT_BATCH) break;
            throw new Error(`${skipped} rows have geometry without coordinates; aborting to avoid a loop`);
        }

        await pool.query(
            `UPDATE geo_layers g
                SET latitude = v.lat, longitude = v.lng
               FROM (VALUES ${tuples.join(',')}) AS v(candidate_id, layer_key, feature_id, lat, lng)
              WHERE g.candidate_id = v.candidate_id
                AND g.layer_key   = v.layer_key
                AND g.feature_id  = v.feature_id`,
            values
        );
        updated += tuples.length;
        process.stdout.write(`\rupdated ${updated}...`);
    }
    console.log(`\ndone: ${updated} rows backfilled, ${skipped} skipped (no usable geometry)`);
    await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
