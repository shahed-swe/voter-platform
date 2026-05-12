-- ============================================================================
-- 008 CANDIDATES — the multi-tenant boundary.
--
-- Each candidate gets a row here, all their data is tagged candidate_id=…,
-- and users are granted access via user_candidates.
-- Existing voter_platform_mt data was copied 1:1 from voter_platform; this
-- migration seeds the 'dhaka13' candidate row so the next migration (009)
-- can stamp every existing row with candidate_id='dhaka13'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidates (
    candidate_id    TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    constituency    TEXT NOT NULL,
    title           TEXT NOT NULL,
    subtitle        TEXT,
    logo_url        TEXT,
    theme           JSONB,
    filter_config   JSONB NOT NULL,
    map_config      JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    created_by      BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);

-- ----------------------------------------------------------------------------
-- user_candidates: per-candidate role grant
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_candidates (
    user_id       BIGINT NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
    candidate_id  TEXT   NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('admin','sub_admin','volunteer')),
    granted_by    BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_user_candidates_user      ON user_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_candidates_candidate ON user_candidates(candidate_id);

-- ----------------------------------------------------------------------------
-- Global super-admin flag on users (orthogonal to per-candidate roles)
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- Seed the dhaka13 candidate. filter_config / map_config mirror what the UI
-- currently hard-codes; they'll be reused by the dynamic renderer in phase 6.
-- ----------------------------------------------------------------------------

INSERT INTO candidates (
    candidate_id, name, constituency, title, subtitle, filter_config, map_config
) VALUES (
    'dhaka13',
    'Bobby Hajjaj',
    'Dhaka-13',
    'Dhaka-13',
    'Prepared for Bobby Hajjaj',
    $$
    [
        {
            "key": "ward",
            "label": "Ward",
            "type": "multi-select",
            "source": "wards",
            "value_col": "ward_id",
            "label_col": "ward_number"
        },
        {
            "key": "voter_area",
            "label": "Voter Area",
            "type": "multi-select-search",
            "source": "voter_areas",
            "value_col": "voter_area_id",
            "label_col": "bangla_voter_area_name",
            "fallback_label_col": "village_name",
            "depends_on": "ward"
        }
    ]
    $$::jsonb,
    $$
    {
        "kind": "urban",
        "base_layer": "wards",
        "drill_layers": ["voter_areas", "buildings"]
    }
    $$::jsonb
)
ON CONFLICT (candidate_id) DO NOTHING;

-- Grant every existing user access to dhaka13 with their current role.
INSERT INTO user_candidates (user_id, candidate_id, role)
SELECT u.user_id, 'dhaka13', u.role
  FROM users u
 WHERE NOT EXISTS (
     SELECT 1 FROM user_candidates uc
      WHERE uc.user_id = u.user_id AND uc.candidate_id = 'dhaka13'
 );
