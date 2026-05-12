-- ============================================================================
-- 001 CORE SCHEMA
-- Villages, voters, voter-village mapping, voter statistics
-- (PostgreSQL port of the SQLite schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS villages (
    village_id        TEXT PRIMARY KEY,
    district          TEXT,
    upazila           TEXT,
    "union"           TEXT,
    mauza             TEXT,
    village_name      TEXT,
    total_population  INTEGER,
    male_count        INTEGER,
    female_count      INTEGER,
    male_pct          DOUBLE PRECISION,
    female_pct        DOUBLE PRECISION,
    geometry          JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_village_upazila    ON villages(upazila);
CREATE INDEX IF NOT EXISTS idx_village_union      ON villages("union");
CREATE INDEX IF NOT EXISTS idx_village_mauza      ON villages(mauza);
CREATE INDEX IF NOT EXISTS idx_village_population ON villages(total_population);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS voters (
    voter_id          BIGSERIAL PRIMARY KEY,
    sos_vid           TEXT UNIQUE NOT NULL,
    name              TEXT NOT NULL,
    father_husband    TEXT,
    mother            TEXT,
    occupation        TEXT,
    birthdate         TEXT,
    age               INTEGER,
    address           TEXT,
    upazila           TEXT NOT NULL,
    "union"           TEXT NOT NULL,
    ward              TEXT,
    post_office       TEXT,
    post_code         TEXT,
    voter_area_name   TEXT,
    voter_area_code   TEXT,
    gender            TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    village_csv       TEXT NOT NULL,
    village_id        TEXT REFERENCES villages(village_id) ON DELETE SET NULL,
    status            TEXT NOT NULL DEFAULT 'Not visited'
                       CHECK (status IN ('Not visited','Visited','Follow-up needed','Declined to participate')),
    clean_voter_area  TEXT,
    usl               TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voters_village_id        ON voters(village_id);
CREATE INDEX IF NOT EXISTS idx_voters_upazila           ON voters(upazila);
CREATE INDEX IF NOT EXISTS idx_voters_union             ON voters("union");
CREATE INDEX IF NOT EXISTS idx_voters_status            ON voters(status);
CREATE INDEX IF NOT EXISTS idx_voters_sos_vid           ON voters(sos_vid);
CREATE INDEX IF NOT EXISTS idx_voters_name              ON voters(name);
CREATE INDEX IF NOT EXISTS idx_voters_gender            ON voters(gender);
CREATE INDEX IF NOT EXISTS idx_voters_age               ON voters(age);
CREATE INDEX IF NOT EXISTS idx_voters_clean_voter_area  ON voters(clean_voter_area);
CREATE INDEX IF NOT EXISTS idx_voters_usl               ON voters(usl);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS voter_village_mapping (
    mapping_id   BIGSERIAL PRIMARY KEY,
    voter_id     BIGINT NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
    village_id   TEXT   NOT NULL REFERENCES villages(village_id) ON DELETE CASCADE,
    is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (voter_id, village_id)
);

CREATE INDEX IF NOT EXISTS idx_vvm_voter_id        ON voter_village_mapping(voter_id);
CREATE INDEX IF NOT EXISTS idx_vvm_village_id      ON voter_village_mapping(village_id);
CREATE INDEX IF NOT EXISTS idx_vvm_is_primary      ON voter_village_mapping(is_primary);
CREATE INDEX IF NOT EXISTS idx_vvm_village_voter   ON voter_village_mapping(village_id, voter_id);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS voter_statistics (
    stat_id                TEXT PRIMARY KEY,
    stat_type              TEXT,
    geographic_level       TEXT,
    name                   TEXT,
    total_voters           INTEGER,
    visited_voters         INTEGER,
    remaining_voters       INTEGER,
    completion_percentage  DOUBLE PRECISION,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stats_type  ON voter_statistics(stat_type);
CREATE INDEX IF NOT EXISTS idx_stats_level ON voter_statistics(geographic_level);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS unmatched_villages (
    id                  SERIAL PRIMARY KEY,
    csv_village_name    TEXT UNIQUE,
    voter_count         INTEGER NOT NULL DEFAULT 0,
    suggested_matches   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_villages_name ON unmatched_villages(csv_village_name);
