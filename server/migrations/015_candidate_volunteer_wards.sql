-- Migration 015: candidate/volunteer/ward isolation
--
-- Adds:
--   user_candidates.allowed_wards       — ward list for volunteer scope restriction
--   user_candidates.political_candidate_id — which political candidate this assignment belongs to
--   canvassing.political_candidate_id   — isolates survey data per political candidate

ALTER TABLE user_candidates
    ADD COLUMN IF NOT EXISTS allowed_wards         TEXT[]  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS political_candidate_id BIGINT  DEFAULT NULL
        REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE canvassing
    ADD COLUMN IF NOT EXISTS political_candidate_id BIGINT DEFAULT NULL
        REFERENCES users(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canvassing_pol_cand
    ON canvassing(candidate_id, political_candidate_id);

CREATE INDEX IF NOT EXISTS idx_user_candidates_pol_cand
    ON user_candidates(candidate_id, political_candidate_id);
