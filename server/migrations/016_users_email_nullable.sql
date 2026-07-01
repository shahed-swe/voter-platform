-- ============================================================================
-- 016 USERS EMAIL NULLABLE + CANDIDATE ROLE
--
-- Two fixes for the candidate/volunteer management feature:
--
-- 1. Candidates and volunteers are created with just name + username + password
--    (no email). users.email was NOT NULL (migration 002), so those inserts
--    failed with a 23502 not-null violation. Email is optional for these
--    accounts; there is no UNIQUE constraint on it, so nullable is safe.
--
-- 2. The 'candidate' role (a political candidate — a person running for office)
--    was added in the app but users_role_check (migration 002) still only
--    allowed admin/sub_admin/volunteer, so creating a candidate user failed
--    with a 23514 check-constraint violation. Add 'candidate' to the allowed set.
-- ============================================================================

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['admin', 'sub_admin', 'volunteer', 'candidate']));

-- user_candidates.role has the same allowed set (migration 008). Granting a
-- political candidate access to a constituency uses role='candidate', which
-- otherwise fails user_candidates_role_check with a 23514 violation.
ALTER TABLE user_candidates DROP CONSTRAINT IF EXISTS user_candidates_role_check;
ALTER TABLE user_candidates ADD CONSTRAINT user_candidates_role_check
    CHECK (role = ANY (ARRAY['admin', 'sub_admin', 'volunteer', 'candidate']));
