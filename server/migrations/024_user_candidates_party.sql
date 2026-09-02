-- ============================================================================
-- 023 USER_CANDIDATES.PARTY_ID — party-tag constituency grants.
--
-- The Political Admin (tenant_admin) registers his party's candidates on a
-- constituency; each political admin must see ONLY his own party's people and
-- surveys. The party tag lives on the CANDIDATE's grant; everyone downstream
-- (campaign admin → sub admin → volunteer) is reached through
-- political_candidate_id, so party scoping = "campaigns whose candidate
-- belongs to my party".
-- ============================================================================

ALTER TABLE user_candidates ADD COLUMN IF NOT EXISTS party_id TEXT REFERENCES parties(party_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_candidates_party ON user_candidates(party_id);

-- Backfill: pre-existing candidates belong to the platform's default party.
UPDATE user_candidates SET party_id = 'default' WHERE role = 'candidate' AND party_id IS NULL;
