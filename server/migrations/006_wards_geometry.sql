-- Add the missing geometry column on wards (polygon footprint).
ALTER TABLE wards ADD COLUMN IF NOT EXISTS geometry JSONB;
