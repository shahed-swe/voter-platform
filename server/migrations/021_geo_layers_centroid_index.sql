-- Speeds up the GPS→building canvass snap: matching a volunteer's fix to a
-- building prefilters geo_layers by centroid bounding box. Centroids are
-- derived from geometry at ingest (see geoLayerIngest.js); existing rows are
-- backfilled by server/scripts/backfill-geo-centroids.js.
CREATE INDEX IF NOT EXISTS idx_geo_layers_centroid
    ON geo_layers (candidate_id, layer_key, latitude, longitude);
