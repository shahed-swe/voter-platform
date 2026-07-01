-- ============================================================================
-- 017 VOLUNTEER → MULTIPLE POLITICAL CANDIDATES
--
-- A single volunteer can work for more than one political candidate — even in
-- the SAME constituency, over the SAME wards. The old primary key
-- (user_id, candidate_id) allowed only one grant per (volunteer, constituency),
-- so a second candidate's assignment overwrote the first.
--
-- Switch to a surrogate primary key and make the natural key include the
-- political candidate, so each (volunteer, constituency, political_candidate)
-- pairing is its own row with its own allowed_wards. NULLS NOT DISTINCT keeps
-- admin/candidate grants (political_candidate_id IS NULL) unique per
-- (user, constituency) as before.
-- ============================================================================

ALTER TABLE user_candidates DROP CONSTRAINT IF EXISTS user_candidates_pkey;

ALTER TABLE user_candidates ADD COLUMN IF NOT EXISTS id BIGSERIAL;

-- Make the surrogate the primary key (only if it isn't already).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'user_candidates'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE user_candidates ADD PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE user_candidates DROP CONSTRAINT IF EXISTS user_candidates_natural_key;
ALTER TABLE user_candidates
    ADD CONSTRAINT user_candidates_natural_key
    UNIQUE NULLS NOT DISTINCT (user_id, candidate_id, political_candidate_id);
