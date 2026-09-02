-- 023: RBAC restructure — 'candidate' joins the constituency-grant roles.
--
-- RECONSTRUCTED FILE. The original was applied to the production database on
-- 2026-08-31 (schema_migrations row exists) but the .sql file was lost from
-- the repo. Recreated on 2026-09-02 by diffing the live schema against
-- migrations 001–022/024–026: the only live object no other file produces is
-- the widened user_candidates role check. Statements are idempotent; on
-- databases that already ran the original, the migration runner skips this
-- file anyway (matched by filename).
--
-- Context: the party era (022) made political candidates first-class users.
-- A candidate holds a CONSTITUENCY grant (user_candidates) like the campaign
-- staff below them — so the grant-role vocabulary needs 'candidate' beside
-- admin / sub_admin / volunteer.

ALTER TABLE user_candidates DROP CONSTRAINT IF EXISTS user_candidates_role_check;
ALTER TABLE user_candidates ADD CONSTRAINT user_candidates_role_check
    CHECK (role = ANY (ARRAY['admin', 'sub_admin', 'volunteer', 'candidate']));
