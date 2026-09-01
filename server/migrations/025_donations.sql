-- ============================================================================
-- 025 DONATIONS (flowApplication.md §9)
--
-- A donor gives money to a volunteer of their own party; the volunteer
-- separately confirms receipt, so both sides of the transaction are recorded
-- independently (status recorded → confirmed).
--
-- party_id anchors party isolation. political_candidate_id / candidate_id
-- capture WHICH campaign the volunteer was serving when the donation was
-- recorded (context for the party ledger); they may be NULL and survive the
-- campaign's later deletion.
-- ============================================================================

CREATE TABLE IF NOT EXISTS donations (
    donation_id            BIGSERIAL PRIMARY KEY,
    party_id               TEXT   NOT NULL REFERENCES parties(party_id) ON DELETE CASCADE,
    donor_user_id          BIGINT NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
    volunteer_user_id      BIGINT NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
    political_candidate_id BIGINT REFERENCES users(user_id)             ON DELETE SET NULL,
    candidate_id           TEXT   REFERENCES candidates(candidate_id)   ON DELETE SET NULL,
    amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    note                   TEXT,
    status                 TEXT NOT NULL DEFAULT 'recorded'
                               CHECK (status IN ('recorded', 'confirmed')),
    recorded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_donations_donor     ON donations(donor_user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_volunteer ON donations(volunteer_user_id, status, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_party     ON donations(party_id, recorded_at DESC);
