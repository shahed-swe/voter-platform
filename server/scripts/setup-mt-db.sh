#!/usr/bin/env bash
# Set up the multi-tenant database (voter_platform_mt) from the existing
# voter_platform database. Idempotent — safe to re-run.
#
# Usage (from project root):
#   docker compose exec -T postgres bash /opt/scripts/setup-mt-db.sh
# or:
#   bash server/scripts/setup-mt-db.sh           # if run inside the postgres container

set -euo pipefail

SRC="${SRC_DB:-voter_platform}"
DST="${DST_DB:-voter_platform_mt}"
USER="${PGUSER:-voter}"

echo "[mt-db] source: $SRC  →  target: $DST  (user: $USER)"

# 1) Create destination DB if it doesn't exist
EXISTS=$(psql -U "$USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DST'")
if [ "$EXISTS" = "1" ]; then
    echo "[mt-db] $DST already exists — skipping create"
else
    echo "[mt-db] creating $DST"
    psql -U "$USER" -d postgres -c "CREATE DATABASE $DST OWNER $USER;"
fi

# 2) Check if target already has data (don't clobber)
ROWS=$(psql -U "$USER" -d "$DST" -tAc "
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='voters')
        THEN (SELECT COUNT(*) FROM voters)
        ELSE 0
    END
" 2>/dev/null || echo 0)
if [ "$ROWS" -gt 0 ]; then
    echo "[mt-db] $DST already populated ($ROWS voter rows) — refusing to overwrite. Drop the DB and re-run if needed."
    exit 0
fi

# 3) Dump source → restore to destination
echo "[mt-db] dumping $SRC and restoring into $DST ..."
pg_dump -U "$USER" -d "$SRC" --no-owner --no-acl \
    | psql -U "$USER" -d "$DST" -v ON_ERROR_STOP=1 -q

echo "[mt-db] done. row counts in $DST:"
psql -U "$USER" -d "$DST" -c "
    SELECT 'voters'      AS table, COUNT(*) FROM voters
    UNION ALL SELECT 'villages',     COUNT(*) FROM villages
    UNION ALL SELECT 'voter_areas',  COUNT(*) FROM voter_areas
    UNION ALL SELECT 'buildings',    COUNT(*) FROM buildings
    UNION ALL SELECT 'canvassing',   COUNT(*) FROM canvassing
    UNION ALL SELECT 'users',        COUNT(*) FROM users
    ORDER BY 1;
"
