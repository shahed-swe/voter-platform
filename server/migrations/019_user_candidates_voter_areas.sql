-- ============================================================================
-- 019 USER_CANDIDATES → VOTER-AREA SCOPE
--
-- The role hierarchy assigns region down the chain:
--   Campaign Admin (role=admin)   → constituency-scoped (its candidate_id grants)
--   Sub-admin      (role=sub_admin)→ ward-scoped        (allowed_wards)
--   Volunteer      (role=volunteer)→ voter-area-scoped  (allowed_voter_areas ← new)
--
-- Volunteers see/work only their assigned voter areas (within their wards).
-- ============================================================================

ALTER TABLE user_candidates
    ADD COLUMN IF NOT EXISTS allowed_voter_areas TEXT[];
