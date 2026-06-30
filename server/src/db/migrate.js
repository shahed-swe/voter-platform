#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pool, query, withTransaction } = require('./pool');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function appliedMigrations() {
    const { rows } = await query('SELECT filename FROM schema_migrations ORDER BY id');
    return new Set(rows.map((r) => r.filename));
}

function listMigrationFiles() {
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => !f.startsWith('.') && f.endsWith('.sql'))
        .sort();
}

async function up() {
    await ensureMigrationsTable();
    const applied = await appliedMigrations();
    const files = listMigrationFiles();

    for (const file of files) {
        if (applied.has(file)) {
            console.log(`[migrate] skip   ${file}`);
            continue;
        }
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        console.log(`[migrate] apply  ${file}`);
        await withTransaction(async (client) => {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        });
    }
    console.log('[migrate] done');
}

async function down() {
    await ensureMigrationsTable();
    const { rows } = await query(
        'SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1'
    );
    if (!rows.length) {
        console.log('[migrate] no migrations to roll back');
        return;
    }
    const file = rows[0].filename;
    const downFile = file.replace(/\.sql$/, '.down.sql');
    const downPath = path.join(MIGRATIONS_DIR, downFile);
    if (!fs.existsSync(downPath)) {
        console.warn(
            `[migrate] no ${downFile}, removing record only. (recreate the schema manually if needed)`
        );
    } else {
        const sql = fs.readFileSync(downPath, 'utf8');
        await withTransaction(async (client) => {
            await client.query(sql);
            await client.query('DELETE FROM schema_migrations WHERE filename = $1', [file]);
        });
    }
    console.log(`[migrate] rolled back ${file}`);
}

async function main() {
    const cmd = process.argv[2] || 'up';
    try {
        if (cmd === 'up') await up();
        else if (cmd === 'down') await down();
        else {
            console.error(`unknown command: ${cmd}`);
            process.exit(1);
        }
    } catch (err) {
        console.error('[migrate] error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) main();

module.exports = { up, down };
