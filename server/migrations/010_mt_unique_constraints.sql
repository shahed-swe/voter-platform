-- ============================================================================
-- 010 Multi-tenant unique constraints.
-- Relax cross-tenant uniqueness so two candidates can have voters with the
-- same sos_vid, or villages with the same village_id, without colliding.
-- The application middleware already enforces candidate scoping on every
-- query; these constraints just make the DB OK with the shared schema.
-- ============================================================================

-- voters.sos_vid: was globally unique → now unique per candidate.
ALTER TABLE voters DROP CONSTRAINT IF EXISTS voters_sos_vid_key;
ALTER TABLE voters ADD CONSTRAINT voters_candidate_sos_vid_key
    UNIQUE (candidate_id, sos_vid);

-- villages.village_id: TEXT PK; can collide if two candidates use the same
-- village_id pattern. Move PK to (candidate_id, village_id). Drop dependent
-- FKs first so we can replace them with composite FKs.

ALTER TABLE voters
    DROP CONSTRAINT IF EXISTS voters_village_id_fkey;

ALTER TABLE voter_village_mapping
    DROP CONSTRAINT IF EXISTS voter_village_mapping_village_id_fkey;

ALTER TABLE user_assignments
    DROP CONSTRAINT IF EXISTS user_assignments_village_id_fkey;

ALTER TABLE villages
    DROP CONSTRAINT IF EXISTS villages_pkey;
ALTER TABLE villages
    ADD CONSTRAINT villages_pkey PRIMARY KEY (candidate_id, village_id);

-- Re-add FKs as composite. voters/voter_village_mapping/user_assignments all
-- already carry candidate_id (migration 009).
ALTER TABLE voters
    ADD CONSTRAINT voters_village_fkey
    FOREIGN KEY (candidate_id, village_id)
    REFERENCES villages(candidate_id, village_id)
    ON DELETE SET NULL;

ALTER TABLE voter_village_mapping
    ADD CONSTRAINT vvm_village_fkey
    FOREIGN KEY (candidate_id, village_id)
    REFERENCES villages(candidate_id, village_id)
    ON DELETE CASCADE;

ALTER TABLE user_assignments
    ADD CONSTRAINT user_assignments_village_fkey
    FOREIGN KEY (candidate_id, village_id)
    REFERENCES villages(candidate_id, village_id)
    ON DELETE SET NULL;
