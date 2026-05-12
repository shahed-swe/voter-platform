-- ============================================================================
-- 005 GEO COLUMNS — bring buildings / voter_areas / wards in line with the
--                   production schema so we can import the full polygon
--                   footprints and demographic columns the legacy app uses.
-- ============================================================================

-- ---------------- buildings ----------------
ALTER TABLE buildings
    ADD COLUMN IF NOT EXISTS osm_id        BIGINT,
    ADD COLUMN IF NOT EXISTS house         TEXT,
    ADD COLUMN IF NOT EXISTS street        TEXT,
    ADD COLUMN IF NOT EXISTS city          TEXT,
    ADD COLUMN IF NOT EXISTS office        TEXT,
    ADD COLUMN IF NOT EXISTS name_bn       TEXT,
    ADD COLUMN IF NOT EXISTS floor_number  TEXT,
    ADD COLUMN IF NOT EXISTS flat_number   TEXT,
    ADD COLUMN IF NOT EXISTS geometry      JSONB;

CREATE INDEX IF NOT EXISTS idx_buildings_osm ON buildings(osm_id);

-- ---------------- voter_areas ----------------
ALTER TABLE voter_areas
    ADD COLUMN IF NOT EXISTS union_name             TEXT,
    ADD COLUMN IF NOT EXISTS mauza_code             TEXT,
    ADD COLUMN IF NOT EXISTS mauza_name             TEXT,
    ADD COLUMN IF NOT EXISTS village_code           TEXT,
    ADD COLUMN IF NOT EXISTS rmo                    TEXT,
    ADD COLUMN IF NOT EXISTS bangla_voter_area_name TEXT,
    ADD COLUMN IF NOT EXISTS total_population       INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS male_count             INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS female_count           INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sex_ratio              DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS household_size         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS total_nrb              INTEGER;

CREATE INDEX IF NOT EXISTS idx_voter_areas_union      ON voter_areas(union_name);
CREATE INDEX IF NOT EXISTS idx_voter_areas_mauza_name ON voter_areas(mauza_name);
CREATE INDEX IF NOT EXISTS idx_voter_areas_population ON voter_areas(total_population);

-- ---------------- wards ----------------
ALTER TABLE wards
    ADD COLUMN IF NOT EXISTS union_name       TEXT,
    ADD COLUMN IF NOT EXISTS total_population INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS male_count       INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS female_count     INTEGER DEFAULT 0;

-- Source uses TEXT for ward_number; relax our column to TEXT to match.
ALTER TABLE wards ALTER COLUMN ward_number TYPE TEXT USING ward_number::text;

CREATE INDEX IF NOT EXISTS idx_wards_union ON wards(union_name);

-- ---------------- constituencies ----------------
-- Source constituencies has additional columns we'd like to keep.
ALTER TABLE constituencies
    ADD COLUMN IF NOT EXISTS constituency_number INTEGER,
    ADD COLUMN IF NOT EXISTS region              TEXT;
