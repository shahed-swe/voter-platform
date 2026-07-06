-- ============================================================================
-- 018 CANVASSING → BUILDING FEATURE LINK
--
-- Buildings in wizard-onboarded constituencies (DhakaSouth) live in geo_layers
-- with TEXT feature_ids (OSM-style, e.g. "node/4364305999"). The legacy
-- canvassing.building_id is BIGINT and can't hold those. Add a TEXT column that
-- records which geo building a canvass was done at, so we can colour canvassed
-- buildings (#6) and reuse the building's geolocation for the voter (#4).
-- ============================================================================

ALTER TABLE canvassing ADD COLUMN IF NOT EXISTS building_feature_id TEXT;

CREATE INDEX IF NOT EXISTS idx_canvassing_building_feature
    ON canvassing (candidate_id, building_feature_id);
