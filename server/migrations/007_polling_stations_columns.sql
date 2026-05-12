-- Polling stations: align with production column names.
ALTER TABLE polling_stations
    ADD COLUMN IF NOT EXISTS polling_centre_name TEXT,
    ADD COLUMN IF NOT EXISTS voter_area          TEXT;

CREATE INDEX IF NOT EXISTS idx_polling_stations_area ON polling_stations(voter_area);
