-- ============================================================================
-- 026 CANDIDATE SELECTION (flowApplication.md §8)
--
-- The Tenant Admin makes the FINAL selection of who the party backs in a
-- seat. The non-selected candidates now support the selected one: their
-- canvassing data and campaign teams move across, so all field intelligence
-- gathered across the seat ends up behind a single campaign.
--
-- One selection per (seat, party); re-selecting (a withdrawal, a changed
-- decision) upserts the row and the handover runs again toward the new pick.
-- The handover itself is a transaction in selectionController; each run is
-- written to audit_logs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_selections (
    id               BIGSERIAL PRIMARY KEY,
    candidate_id     TEXT   NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    party_id         TEXT   NOT NULL REFERENCES parties(party_id)        ON DELETE CASCADE,
    selected_user_id BIGINT NOT NULL REFERENCES users(user_id)           ON DELETE CASCADE,
    selected_by      BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    selected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (candidate_id, party_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_selections_party ON candidate_selections(party_id);
