-- ============================================================================
-- 002 USERS, ASSIGNMENTS, SESSIONS, AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    user_id           BIGSERIAL PRIMARY KEY,
    username          TEXT UNIQUE NOT NULL,
    email             TEXT NOT NULL,
    name              TEXT NOT NULL,
    password_hash     TEXT NOT NULL,
    role              TEXT NOT NULL CHECK (role IN ('admin','sub_admin','volunteer')),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    password_changed  BOOLEAN NOT NULL DEFAULT FALSE,
    phone             VARCHAR(20),
    address           TEXT,
    referred_by       BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username    ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_phone       ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_assignments (
    assignment_id          BIGSERIAL PRIMARY KEY,
    user_id                BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    assigned_by_user_id    BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    assignment_type        TEXT NOT NULL CHECK (assignment_type IN
                                ('upazila','union','mauza','village','voter_area')),
    assignment_value       TEXT NOT NULL,
    village_id             TEXT REFERENCES villages(village_id) ON DELETE SET NULL,
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_id    ON user_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_type       ON user_assignments(assignment_type);
CREATE INDEX IF NOT EXISTS idx_assignments_village_id ON user_assignments(village_id);
CREATE INDEX IF NOT EXISTS idx_assignments_value      ON user_assignments(assignment_value);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id    BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token         TEXT UNIQUE NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    ip_address    TEXT,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id        BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT,
    entity_id     BIGINT,
    changes       JSONB,
    ip_address    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
