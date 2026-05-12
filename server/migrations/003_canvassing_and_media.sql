-- ============================================================================
-- 003 CANVASSING + MEDIA
-- ============================================================================

CREATE TABLE IF NOT EXISTS canvassing (
    canvass_id           BIGSERIAL PRIMARY KEY,
    voter_id             BIGINT NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
    user_id              BIGINT NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
    support_level        TEXT NOT NULL,
    contact_phone        TEXT,
    contact_email        TEXT,
    issues_concerns      TEXT,
    household_size       INTEGER,
    income_bracket       TEXT,
    follow_up_needed     BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_date       DATE,
    canvass_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude             DOUBLE PRECISION,
    longitude            DOUBLE PRECISION,
    location_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    support_rating       INTEGER CHECK (support_rating BETWEEN 1 AND 5),
    is_undecided         BOOLEAN NOT NULL DEFAULT FALSE,
    source               TEXT NOT NULL DEFAULT 'Primary' CHECK (source IN ('Primary','Secondary')),
    voter_member_count   INTEGER,
    is_minority          BOOLEAN NOT NULL DEFAULT FALSE,
    -- Building / address fields (dhaka13 extensions)
    floor_number         TEXT,
    flat_number          TEXT,
    building_name        TEXT,
    address              TEXT,
    building_id          BIGINT
);

CREATE INDEX IF NOT EXISTS idx_canvassing_user_id         ON canvassing(user_id);
CREATE INDEX IF NOT EXISTS idx_canvassing_voter_id        ON canvassing(voter_id);
CREATE INDEX IF NOT EXISTS idx_canvassing_canvass_date    ON canvassing(canvass_date);
CREATE INDEX IF NOT EXISTS idx_canvassing_location        ON canvassing(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_canvassing_support_rating  ON canvassing(support_rating);
CREATE INDEX IF NOT EXISTS idx_canvassing_is_undecided    ON canvassing(is_undecided);
CREATE INDEX IF NOT EXISTS idx_canvassing_source          ON canvassing(source);
CREATE INDEX IF NOT EXISTS idx_canvassing_is_minority     ON canvassing(is_minority);
CREATE INDEX IF NOT EXISTS idx_canvassing_building_id     ON canvassing(building_id);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media_files (
    media_id           BIGSERIAL PRIMARY KEY,
    canvass_id         BIGINT NOT NULL REFERENCES canvassing(canvass_id) ON DELETE CASCADE,
    voter_id           BIGINT NOT NULL REFERENCES voters(voter_id) ON DELETE CASCADE,
    file_type          TEXT NOT NULL CHECK (file_type IN ('photo','audio')),
    mime_type          TEXT NOT NULL,
    file_name          TEXT NOT NULL,
    file_path          TEXT NOT NULL,
    original_size      BIGINT,
    compressed_size    BIGINT,
    duration_seconds   INTEGER,
    transcription      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_files_canvass_id ON media_files(canvass_id);
CREATE INDEX IF NOT EXISTS idx_media_files_voter_id   ON media_files(voter_id);
CREATE INDEX IF NOT EXISTS idx_media_files_file_type  ON media_files(file_type);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON media_files(created_at);
