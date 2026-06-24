-- Composite indexes for the most common voter filter paths.
-- Without these, filtering by ward/voter_area/status does a full scan
-- across 400K+ rows per candidate, causing >30s timeouts.

CREATE INDEX IF NOT EXISTS idx_voters_candidate_ward
    ON voters (candidate_id, ward);

CREATE INDEX IF NOT EXISTS idx_voters_candidate_voter_area
    ON voters (candidate_id, voter_area_name);

CREATE INDEX IF NOT EXISTS idx_voters_candidate_status
    ON voters (candidate_id, status);
