-- ============================================================================
-- 004 URBAN / CONSTITUENCY EXTENSIONS
-- Wards, voter areas, buildings, polling stations
-- (Used by dhaka13-style deployments; safe for rural deployments too)
-- ============================================================================

CREATE TABLE IF NOT EXISTS constituencies (
    constituency_id   TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    district          TEXT,
    upazila           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wards (
    ward_id          TEXT PRIMARY KEY,
    constituency_id  TEXT REFERENCES constituencies(constituency_id) ON DELETE SET NULL,
    ward_number      INTEGER,
    name             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wards_constituency ON wards(constituency_id);
CREATE INDEX IF NOT EXISTS idx_wards_number       ON wards(ward_number);

CREATE TABLE IF NOT EXISTS voter_areas (
    voter_area_id    TEXT PRIMARY KEY,
    ward_id          TEXT REFERENCES wards(ward_id) ON DELETE SET NULL,
    village_name     TEXT,
    voter_area_name  TEXT,
    geometry         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voter_areas_ward         ON voter_areas(ward_id);
CREATE INDEX IF NOT EXISTS idx_voter_areas_village_name ON voter_areas(village_name);

CREATE TABLE IF NOT EXISTS buildings (
    building_id      BIGSERIAL PRIMARY KEY,
    voter_area_id    TEXT REFERENCES voter_areas(voter_area_id) ON DELETE SET NULL,
    building_name    TEXT,
    address          TEXT,
    latitude         DOUBLE PRECISION,
    longitude        DOUBLE PRECISION,
    floors           INTEGER,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buildings_voter_area ON buildings(voter_area_id);
CREATE INDEX IF NOT EXISTS idx_buildings_location   ON buildings(latitude, longitude);

CREATE TABLE IF NOT EXISTS polling_stations (
    polling_station_id   TEXT PRIMARY KEY,
    ward_id              TEXT REFERENCES wards(ward_id) ON DELETE SET NULL,
    name                 TEXT,
    address              TEXT,
    latitude             DOUBLE PRECISION,
    longitude            DOUBLE PRECISION,
    metadata             JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polling_stations_ward ON polling_stations(ward_id);

-- Wire canvassing.building_id to buildings now that the table exists.
ALTER TABLE canvassing
    DROP CONSTRAINT IF EXISTS canvassing_building_id_fkey;

ALTER TABLE canvassing
    ADD CONSTRAINT canvassing_building_id_fkey
    FOREIGN KEY (building_id) REFERENCES buildings(building_id) ON DELETE SET NULL;
