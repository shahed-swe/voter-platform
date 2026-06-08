#!/usr/bin/env bash
# Idempotent full-data restore for voter_platform_mt.
#
#   Inputs (host files):
#     imports/dhaka_north.sql        — pg_dump of the dhaka13 production VPS
#     imports/panchagar_villages.csv
#     imports/panchagar_voters.csv
#
# What it does:
#   1. Starts the staging postgis container
#   2. Loads dhaka_north.sql into staging
#   3. Imports dhaka13 into voter_platform_mt (preserves source IDs → FKs intact)
#   4. Loads panchagar CSVs into staging + NULLs orphan village refs
#   5. Imports panchagarh into voter_platform_mt with REASSIGN_IDS=true
#   6. Seeds users (admin super_admin, noushad)
#   7. Seeds the panchagarh candidate row
#
# Usage (from voter-platform/):
#   bash scripts/restore-data.sh
# Re-running is safe — it deletes-then-rebuilds per-candidate data.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "──── 1/7  Bring stack up ─────────────────────────────"
docker compose up -d 2>&1 | tail -3

echo
echo "──── 2/7  Start staging (PostGIS) ─────────────────────"
docker compose --profile import up -d staging
sleep 5

echo
echo "──── 3/7  Load dhaka_north.sql into staging ──────────"
docker compose exec -T staging psql -U staging -d postgres -c "DROP DATABASE IF EXISTS dhaka_north;" >/dev/null
docker compose exec -T staging psql -U staging -d postgres -c "CREATE DATABASE dhaka_north OWNER staging;" >/dev/null
cat imports/dhaka_north.sql | docker compose exec -T staging psql -U staging -d dhaka_north -v ON_ERROR_STOP=0 -q 2>&1 \
    | grep -E 'ERROR|FATAL' | head -3 || true
echo "  dhaka_north row counts:"
docker compose exec -T staging psql -U staging -d dhaka_north -tAc "
  SELECT 'voters=' || COUNT(*) FROM voters;
  SELECT 'villages=' || COUNT(*) FROM villages;
  SELECT 'buildings=' || COUNT(*) FROM buildings;"

echo
echo "──── 4/7  Import dhaka13 into voter_platform_mt ──────"
docker compose exec -T \
    -e SOURCE_DATABASE_URL=postgres://staging:staging@staging:5432/dhaka_north \
    -e CANDIDATE_ID=dhaka13 \
    -e IMPORT_TRUNCATE=true \
    server npm run import:legacy 2>&1 \
    | grep -vE '^\s+(voters|buildings|polling_stations|voter_areas|wards|villages|canvassing|users|audit_logs): [0-9,]+ /[ 0-9,]+$' \
    | tail -20

echo
echo "──── 5/7  Load panchagar CSVs + import ────────────────"
docker compose exec -T staging psql -U staging -d postgres -c "DROP DATABASE IF EXISTS panchagar_legacy;" >/dev/null
docker compose exec -T staging psql -U staging -d postgres -c "CREATE DATABASE panchagar_legacy OWNER staging;" >/dev/null
docker compose exec -T staging psql -U staging -d panchagar_legacy <<'SQL' >/dev/null
CREATE TABLE villages (
    village_id TEXT PRIMARY KEY, district TEXT, upazila TEXT, "union" TEXT, mauza TEXT,
    village_name TEXT, total_population INTEGER, male_count INTEGER, female_count INTEGER,
    male_pct REAL, female_pct REAL, geometry TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE voters (
    voter_id INTEGER PRIMARY KEY, sos_vid TEXT, temp_sos_vid TEXT, name TEXT,
    father_husband TEXT, mother TEXT, occupation TEXT, birthdate TEXT, age INTEGER, address TEXT,
    upazila TEXT, "union" TEXT, ward TEXT, post_office TEXT, post_code TEXT,
    voter_area_name TEXT, voter_area_code TEXT, gender TEXT, village_csv TEXT, village_id TEXT,
    status TEXT, clean_voter_area TEXT, usl TEXT, created_at TEXT, updated_at TEXT
);
SQL
docker compose exec -T staging psql -U staging -d panchagar_legacy -c "\copy villages FROM '/imports/panchagar_villages.csv' WITH (FORMAT csv, HEADER true);" >/dev/null
docker compose exec -T staging psql -U staging -d panchagar_legacy -c "\copy voters   FROM '/imports/panchagar_voters.csv'   WITH (FORMAT csv, HEADER true);" >/dev/null
docker compose exec -T staging psql -U staging -d panchagar_legacy -c "
  UPDATE voters SET village_id = NULL
   WHERE village_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM villages WHERE villages.village_id = voters.village_id);" >/dev/null

echo "  seed panchagarh candidate row …"
docker compose exec -T postgres psql -U voter -d voter_platform_mt <<'SQL' >/dev/null
INSERT INTO candidates (
    candidate_id, name, constituency, title, subtitle, filter_config, map_config
) VALUES (
    'panchagarh', 'Noushad Zameer', 'Panchagarh-1', 'Panchagarh-1', 'Prepared for Noushad Zameer',
    $$ [
        { "key": "upazila", "label": "Upazila", "label_bn": "উপজেলা", "type": "checkbox-group",
          "source": "villages", "value_col": "upazila",  "label_col": "upazila" },
        { "key": "union", "label": "Union", "label_bn": "ইউনিয়ন", "type": "select",
          "source": "villages", "value_col": "union", "label_col": "union", "depends_on": "upazila" },
        { "key": "mauza", "label": "Mauza", "label_bn": "মৌজা", "type": "select",
          "source": "villages", "value_col": "mauza", "label_col": "mauza", "depends_on": "union" },
        { "key": "voter_area", "label": "Voter Area", "type": "select",
          "source": "voters", "value_col": "voter_area_name", "label_col": "voter_area_name" },
        { "key": "village", "label": "Village", "type": "select",
          "source": "villages", "value_col": "village_id", "label_col": "village_name", "depends_on": "mauza" }
    ] $$::jsonb,
    $$ { "kind": "rural", "base_layer": "villages", "shade_by": "total_population",
         "legend": { "label": "Voter Density", "buckets": [0, 2000, 5000, 10000, 15000] } } $$::jsonb
) ON CONFLICT (candidate_id) DO NOTHING;
SQL

docker compose exec -T \
    -e SOURCE_DATABASE_URL=postgres://staging:staging@staging:5432/panchagar_legacy \
    -e CANDIDATE_ID=panchagarh \
    -e IMPORT_TABLES=villages,voters \
    -e IMPORT_TRUNCATE=true \
    -e REASSIGN_IDS=true \
    server npm run import:legacy 2>&1 \
    | grep -vE '^\s+(voters|villages): [0-9,]+ /[ 0-9,]+$' \
    | tail -10

echo
echo "──── 6/7  Seed users (admin super_admin, noushad) ────"
docker compose exec -T server node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adminHash = await bcrypt.hash('admin123', 10);
    const nousHash  = await bcrypt.hash('panchagarh123', 10);

    // admin → super_admin + access to BOTH candidates
    await pool.query(\`UPDATE users SET password_hash=\$1, is_super_admin=TRUE
                        WHERE username='admin'\`, [adminHash]);
    await pool.query(\`INSERT INTO user_candidates (user_id, candidate_id, role)
                        SELECT user_id, 'panchagarh', 'admin' FROM users WHERE username='admin'
                        ON CONFLICT DO NOTHING\`);

    // noushad → panchagarh-only admin
    const r = await pool.query(\`
        INSERT INTO users (username, email, name, password_hash, role)
        VALUES ('noushad', 'noushad@panchagarh.com', 'Noushad Zameer Admin', \$1, 'admin')
        ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING user_id\`, [nousHash]);
    await pool.query(\`
        INSERT INTO user_candidates (user_id, candidate_id, role)
        VALUES (\$1, 'panchagarh', 'admin')
        ON CONFLICT DO NOTHING\`, [r.rows[0].user_id]);

    console.log('users seeded');
    await pool.end();
})();" 2>&1 | tail -2

echo
echo "──── 7/7  Final verification ─────────────────────────"
docker compose exec -T postgres psql -U voter -d voter_platform_mt -c "
  SELECT 'voters'      AS t, candidate_id, COUNT(*) FROM voters       GROUP BY 2
  UNION ALL SELECT 'villages',    candidate_id, COUNT(*) FROM villages     GROUP BY 2
  UNION ALL SELECT 'voter_areas', candidate_id, COUNT(*) FROM voter_areas  GROUP BY 2
  UNION ALL SELECT 'buildings',   candidate_id, COUNT(*) FROM buildings    GROUP BY 2
  UNION ALL SELECT 'candidates',  candidate_id, COUNT(*) FROM candidates   GROUP BY 2
  UNION ALL SELECT 'users (global)', '—', COUNT(*) FROM users
  ORDER BY 1, 2;"

echo
echo "Done. Credentials:"
echo "  admin    / admin123        (super_admin, both candidates)"
echo "  noushad  / panchagarh123   (panchagarh only)"
