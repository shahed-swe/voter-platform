#!/usr/bin/env node
/**
 * Imports legacy data from a source PostgreSQL DB into voter_platform.
 *
 * Workflow (safer path):
 *   1. pg_dump --no-owner --no-acl from production into a .sql file
 *   2. Restore that dump into a local *staging* database
 *   3. Set SOURCE_DATABASE_URL to point at staging and run this script
 *
 * The script:
 *   • Inspects staging's columns and copies only columns that exist in BOTH
 *     staging and our target schema. This is resilient to minor schema drift.
 *   • Converts PostGIS `geometry` columns to GeoJSON (JSONB) on the fly so
 *     they fit our schema.
 *   • Imports tables in foreign-key dependency order.
 *   • Streams in batches (no full-table loads).
 *   • Resets BIGSERIAL sequences at the end so future inserts don't collide.
 *
 * Env vars:
 *   SOURCE_DATABASE_URL    required — staging DB containing the dump
 *   DATABASE_URL           required — target voter_platform DB (same one
 *                          the API uses)
 *   IMPORT_TRUNCATE        "true" (default) wipes the target tables before
 *                          import. Set to "false" to append.
 *   IMPORT_BATCH_SIZE      default 1000
 *
 * Usage:
 *   node scripts/import-legacy.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;
const BATCH      = parseInt(process.env.IMPORT_BATCH_SIZE || '1000', 10);
const TRUNCATE   = (process.env.IMPORT_TRUNCATE || 'true') !== 'false';
// Optional comma-separated whitelist of tables to import. If set, only those
// tables run (truncates and copies are scoped to them).
const ONLY_TABLES = (process.env.IMPORT_TABLES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

if (!SOURCE_URL || !TARGET_URL) {
    console.error('SOURCE_DATABASE_URL and DATABASE_URL are required.');
    process.exit(1);
}

// Tables we know how to import, in dependency order. Each entry is the
// target table name; columns are auto-detected as the intersection of
// source and target columns.
const PLAN = [
    'constituencies',
    'wards',
    'villages',
    'voter_areas',
    'buildings',
    'polling_stations',
    'voters',
    'voter_village_mapping',
    'users',
    'user_assignments',
    'canvassing',
    'media_files',
    'audit_logs',
    'voter_statistics',
    'unmatched_villages',
];

// Columns that need a SELECT-side transformation when reading from staging.
// Key is "<table>.<source-column-name>". The read expression replaces the
// column in the SELECT; the column is INSERTed into the same-named target col.
const READ_TRANSFORMS = {
    'villages.geometry':    'CASE WHEN geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(geometry)::jsonb END',
    'voter_areas.geometry': 'CASE WHEN geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(geometry)::jsonb END',
    'wards.geometry':       'CASE WHEN geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(geometry)::jsonb END',
};

// "Synthetic" target columns — read from a source column / expression but
// stored under a DIFFERENT target column name. Used to bring across the
// PostGIS `geom` polygons as JSONB GeoJSON in our `geometry` column.
const SYNTHETIC_COLS = {
    'buildings.geometry':   { sourceExpr: 'ST_AsGeoJSON(geom)::jsonb', requires: ['geom'] },
};

const source = new Pool({ connectionString: SOURCE_URL });
const target = new Pool({ connectionString: TARGET_URL });

async function columnsOf(pool, table) {
    const { rows } = await pool.query(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table]
    );
    return rows;
}

function readExpr(table, col) {
    const key = `${table}.${col.column_name}`;
    if (READ_TRANSFORMS[key]) return `${READ_TRANSFORMS[key]} AS "${col.column_name}"`;
    // Quote identifier in case it's reserved (e.g. "union")
    return `"${col.column_name}"`;
}

async function countRows(pool, table) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
    return rows[0].c;
}

async function importTable(table) {
    const sourceCols = await columnsOf(source, table);
    const targetCols = await columnsOf(target, table);

    if (sourceCols.length === 0) {
        console.log(`[skip] ${table} — not in source`);
        return;
    }
    if (targetCols.length === 0) {
        console.log(`[skip] ${table} — not in target`);
        return;
    }

    const targetColSet = new Set(targetCols.map((c) => c.column_name));
    const sourceColSet = new Set(sourceCols.map((c) => c.column_name));
    const shared = sourceCols.filter((c) => targetColSet.has(c.column_name));

    // Add synthetic columns (source has different column name, e.g. `geom`)
    const synthetic = [];
    for (const [key, def] of Object.entries(SYNTHETIC_COLS)) {
        const [t, targetCol] = key.split('.');
        if (t !== table) continue;
        if (!targetColSet.has(targetCol)) continue;
        if (shared.some((c) => c.column_name === targetCol)) continue; // already covered
        if (def.requires && !def.requires.every((req) => sourceColSet.has(req))) continue;
        synthetic.push({ targetCol, sourceExpr: def.sourceExpr });
    }

    if (shared.length === 0 && synthetic.length === 0) {
        console.log(`[skip] ${table} — no shared columns`);
        return;
    }

    const sourceCount = await countRows(source, table);
    console.log(
        `[copy] ${table} ` +
        `(${shared.length + synthetic.length} cols, source rows=${sourceCount.toLocaleString()})`
    );
    if (sourceCount === 0) return;

    const sharedSelects = shared.map((c) => readExpr(table, c));
    const syntheticSelects = synthetic.map((s) => `${s.sourceExpr} AS "${s.targetCol}"`);
    const selectList = [...sharedSelects, ...syntheticSelects].join(', ');

    const allCols = [
        ...shared.map((c) => c.column_name),
        ...synthetic.map((s) => s.targetCol),
    ];
    const colList = allCols.map((c) => `"${c}"`).join(', ');

    let offset = 0;
    let total = 0;
    /* eslint-disable no-constant-condition */
    while (true) {
        const { rows } = await source.query(
            `SELECT ${selectList} FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2`,
            [BATCH, offset]
        );
        if (rows.length === 0) break;

        // Build a single multi-row INSERT for the batch.
        const colCount = allCols.length;
        const values = [];
        const placeholders = rows
            .map((row, i) => {
                const ph = allCols.map((_, j) => `$${i * colCount + j + 1}`).join(', ');
                allCols.forEach((col) => values.push(row[col]));
                return `(${ph})`;
            })
            .join(', ');

        await target.query(
            `INSERT INTO "${table}" (${colList}) VALUES ${placeholders}
             ON CONFLICT DO NOTHING`,
            values
        );

        total += rows.length;
        offset += rows.length;
        process.stdout.write(`\r  ${table}: ${total.toLocaleString()} / ${sourceCount.toLocaleString()}`);
    }
    process.stdout.write('\n');
}

async function truncateTargets() {
    if (!TRUNCATE) return;
    const list = ONLY_TABLES.length ? ONLY_TABLES : PLAN;
    const order = [...list].reverse(); // delete children before parents
    console.log('[truncate] clearing target tables (set IMPORT_TRUNCATE=false to skip)');
    for (const t of order) {
        try {
            await target.query(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
        } catch (err) {
            console.warn(`  ${t}: ${err.message}`);
        }
    }
}

async function resetSequences() {
    // For every BIGSERIAL/SERIAL column, bump its sequence past MAX(id).
    console.log('[sequences] resetting');
    const { rows } = await target.query(`
        SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
          FROM pg_class s
          JOIN pg_depend d ON d.objid = s.oid
          JOIN pg_class t ON t.oid = d.refobjid
          JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
         WHERE s.relkind = 'S' AND t.relnamespace = 'public'::regnamespace
    `);
    for (const r of rows) {
        try {
            await target.query(
                `SELECT setval('${r.seq}', COALESCE((SELECT MAX("${r.col}") FROM "${r.tbl}"), 0) + 1, false)`
            );
        } catch (err) {
            console.warn(`  ${r.seq}: ${err.message}`);
        }
    }
}

async function main() {
    console.log('[import] source:', SOURCE_URL.replace(/:[^@]+@/, ':****@'));
    console.log('[import] target:', TARGET_URL.replace(/:[^@]+@/, ':****@'));

    await truncateTargets();

    const plan = ONLY_TABLES.length
        ? PLAN.filter((t) => ONLY_TABLES.includes(t))
        : PLAN;
    for (const table of plan) {
        try {
            await importTable(table);
        } catch (err) {
            console.error(`[error] ${table}:`, err.message);
        }
    }

    await resetSequences();
    console.log('[import] done');
}

main()
    .catch((err) => {
        console.error('[fatal]', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await source.end().catch(() => {});
        await target.end().catch(() => {});
    });
