-- ============================================================================
-- 022 PARTIES — the party layer above constituencies (docs/application-flows/
-- restructured.md). Introduces the two party-level roles:
--   tenant_admin (Political Admin / party lead) and donor.
--
-- NOTE: on the current dev database this migration was already applied during
-- an earlier iteration (schema_migrations records the filename, so the runner
-- skips it here). The file exists so FRESH databases build the same schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS parties (
    party_id    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    logo_url    TEXT,
    theme       JSONB,
    status      TEXT NOT NULL DEFAULT 'active',
    created_by  BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parties_status ON parties(status);

-- Every constituency campaign belongs to one party. RESTRICT (not CASCADE):
-- deleting a party must be an explicit operator flow, never a silent wipe of
-- voter rolls + canvassing data.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS party_id TEXT REFERENCES parties(party_id) ON DELETE RESTRICT;

-- Adopt existing constituencies into a default party so the column can be
-- NOT NULL. Idempotent: the insert no-ops on re-run.
INSERT INTO parties (party_id, name)
VALUES ('default', 'Default Party')
ON CONFLICT (party_id) DO NOTHING;

UPDATE candidates SET party_id = 'default' WHERE party_id IS NULL;

ALTER TABLE candidates ALTER COLUMN party_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party_id);

-- ----------------------------------------------------------------------------
-- user_parties: party-level grants. Political Admins (tenant_admin) and Donors
-- sit at party level, not constituency level, so they get their own grant
-- table. (Campaign admins / sub admins / candidates / volunteers keep deriving
-- their party through user_candidates → candidates.party_id.)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_parties (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(user_id)       ON DELETE CASCADE,
    party_id    TEXT   NOT NULL REFERENCES parties(party_id)    ON DELETE CASCADE,
    role        TEXT   NOT NULL CHECK (role IN ('tenant_admin','donor')),
    granted_by  BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, party_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_parties_user  ON user_parties(user_id);
CREATE INDEX IF NOT EXISTS idx_user_parties_party ON user_parties(party_id);

-- ----------------------------------------------------------------------------
-- Widen the role vocabulary (016 pattern) with the two party-level roles.
-- ----------------------------------------------------------------------------

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['admin', 'sub_admin', 'volunteer', 'candidate', 'tenant_admin', 'donor']));
