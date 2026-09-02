#!/usr/bin/env node
/**
 * Regenerates docs/database/schema.generated.md from the LIVE database.
 *
 * The generated file is the mechanical truth (columns, types, keys, indexes) —
 * regenerate it after every migration so it can never rot. The hand-written
 * semantics live in docs/database/tables.md and reference this file.
 *
 * Run from the repo root:  node server/scripts/generate-schema-docs.js
 */
const fs = require('fs');
const path = require('path');
const { many, pool } = require('../src/db/pool');

const OUT = path.join(__dirname, '..', '..', 'docs', 'database', 'schema.generated.md');

async function main() {
    const tables = (await many(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name`
    )).map((t) => t.table_name);

    const columns = await many(
        `SELECT table_name, column_name, ordinal_position,
                data_type, udt_name, character_maximum_length,
                is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position`
    );

    // Primary keys + unique constraints
    const keyCols = await many(
        `SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
                kcu.column_name, kcu.ordinal_position
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name
               AND kcu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
          ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`
    );

    // Foreign keys with referenced table/column and delete rule
    const fks = await many(
        `SELECT tc.table_name, kcu.column_name,
                ccu.table_name AS ref_table, ccu.column_name AS ref_column,
                rc.delete_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
           JOIN information_schema.referential_constraints rc
                ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
           JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = rc.unique_constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
          ORDER BY tc.table_name, kcu.column_name`
    );

    // Check constraints (skip NOT NULL noise)
    const checks = await many(
        `SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS def
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace ns ON ns.oid = rel.relnamespace
          WHERE ns.nspname = 'public' AND con.contype = 'c'
          ORDER BY rel.relname, con.conname`
    );

    // Indexes (excluding those backing PK/UNIQUE constraints)
    const indexes = await many(
        `SELECT tablename AS table_name, indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname NOT IN (
                SELECT conname FROM pg_constraint WHERE contype IN ('p','u'))
          ORDER BY tablename, indexname`
    );

    const rowCounts = {};
    for (const t of tables) {
        const [{ n }] = await many(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
        rowCounts[t] = n;
    }

    const by = (rows, key) => rows.reduce((m, r) => (((m[r[key]] ||= []).push(r)), m), {});
    const colsBy = by(columns, 'table_name');
    const keysBy = by(keyCols, 'table_name');
    const fksBy = by(fks, 'table_name');
    const checksBy = by(checks, 'table_name');
    const idxBy = by(indexes, 'table_name');

    const typeOf = (c) => {
        let t = c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type;
        if (t === 'character varying') t = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'varchar';
        if (t === 'timestamp with time zone') t = 'timestamptz';
        if (t === 'timestamp without time zone') t = 'timestamp';
        if (t === 'ARRAY') t = `${c.udt_name.replace(/^_/, '')}[]`;
        return t;
    };

    let md = `# Database schema (generated)\n\n`;
    md += `> **Do not edit by hand.** Regenerate after every migration:\n`;
    md += `> \`node server/scripts/generate-schema-docs.js\`\n>\n`;
    md += `> Semantics and relationships are documented in [tables.md](tables.md);\n`;
    md += `> the ER diagram lives in [er-diagram.md](er-diagram.md).\n\n`;
    md += `Generated: ${new Date().toISOString().slice(0, 10)} · ${tables.length} tables\n\n`;

    for (const t of tables) {
        md += `## ${t}\n\n`;
        md += `Rows at generation time: ${Number(rowCounts[t]).toLocaleString('en-US')}\n\n`;
        md += `| Column | Type | Null | Default |\n|---|---|---|---|\n`;
        for (const c of colsBy[t] || []) {
            const def = (c.column_default || '')
                .replace(/::[a-z_ ]+(\[\])?/g, '')
                .replace(/^nextval\('(.+)'\)$/, 'nextval($1)');
            md += `| ${c.column_name} | ${typeOf(c)} | ${c.is_nullable === 'YES' ? 'yes' : ''} | ${def} |\n`;
        }
        const keys = keysBy[t] || [];
        const grouped = {};
        for (const k of keys) (grouped[k.constraint_name] ||= { type: k.constraint_type, cols: [] }).cols.push(k.column_name);
        const keyLines = Object.entries(grouped)
            .map(([name, k]) => `- **${k.type === 'PRIMARY KEY' ? 'PK' : 'UNIQUE'}** (${k.cols.join(', ')})${k.type === 'UNIQUE' ? ` — \`${name}\`` : ''}`);
        const fkLines = (fksBy[t] || [])
            .map((f) => `- **FK** ${f.column_name} → ${f.ref_table}.${f.ref_column}${f.delete_rule && f.delete_rule !== 'NO ACTION' ? ` (ON DELETE ${f.delete_rule})` : ''}`);
        const checkLines = (checksBy[t] || [])
            .filter((c) => !/IS NOT NULL\)$/.test(c.def))
            .map((c) => `- **CHECK** \`${c.def.replace(/^CHECK /, '')}\``);
        const idxLines = (idxBy[t] || [])
            .map((i) => `- **INDEX** \`${i.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ /, '$1').trim()}\``);
        const lines = [...keyLines, ...fkLines, ...checkLines, ...idxLines];
        if (lines.length) md += `\n${lines.join('\n')}\n`;
        md += `\n`;
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, md);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${tables.length} tables)`);
    await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
