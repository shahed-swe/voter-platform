-- ============================================================================
-- 009 candidate_id EVERYWHERE
--
-- Adds NOT NULL candidate_id to every data table with DEFAULT 'dhaka13' so
-- the existing rows are stamped in one shot. After backfill we drop the
-- default — new inserts must explicitly carry their candidate_id (enforced
-- by the auto-scope middleware in phase 2).
-- ============================================================================

-- Helper-ish: per-table DO blocks. We use 'IF NOT EXISTS' so this migration
-- is idempotent on re-run.

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'villages',
        'voters',
        'voter_village_mapping',
        'voter_statistics',
        'unmatched_villages',
        'user_assignments',
        'user_sessions',
        'audit_logs',
        'constituencies',
        'wards',
        'voter_areas',
        'buildings',
        'polling_stations',
        'canvassing',
        'media_files'
    ] LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=tbl)
            AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=tbl AND column_name='candidate_id'
            ) THEN

            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN candidate_id TEXT NOT NULL DEFAULT %L
                 REFERENCES candidates(candidate_id) ON DELETE CASCADE',
                tbl, 'dhaka13'
            );

            -- Drop the default — new inserts must specify candidate_id explicitly.
            EXECUTE format('ALTER TABLE %I ALTER COLUMN candidate_id DROP DEFAULT', tbl);

            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(candidate_id)',
                           'idx_' || tbl || '_candidate', tbl);
        END IF;
    END LOOP;
END $$;
