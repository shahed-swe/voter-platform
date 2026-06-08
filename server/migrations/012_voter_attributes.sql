-- ============================================================================
-- 012 VOTER ATTRIBUTES — make the voters table accept any constituency's CSV.
--
-- 1. `attributes` JSONB holds per-constituency columns that have no fixed home
--    (e.g. Dhaka-18's "Sector", "Voter_Area_Number", "Road_Cleaned").
-- 2. Relax NOT NULL on columns that aren't universal across constituencies.
--    (upazila/union/village_csv were required for the rural schema but a city
--    seat's CSV may not have them.) Existing rows are unaffected.
-- ============================================================================

ALTER TABLE voters ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE voters ALTER COLUMN upazila      DROP NOT NULL;
ALTER TABLE voters ALTER COLUMN "union"      DROP NOT NULL;
ALTER TABLE voters ALTER COLUMN village_csv  DROP NOT NULL;

-- GIN index so attribute filters (attributes->>'Sector' = ...) stay fast.
CREATE INDEX IF NOT EXISTS idx_voters_attributes ON voters USING gin (attributes);
