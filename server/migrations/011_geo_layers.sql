-- ============================================================================
-- 011 GEO_LAYERS — generic, schema-less store for ANY geographic layer type.
--
-- Existing candidates (dhaka13, panchagarh) keep their dedicated tables
-- (wards / voter_areas / buildings / villages / polling_stations). NEW
-- candidates onboarded through the wizard store every geographic layer here
-- instead — so a brand-new layer type (e.g. "sector", "block", "moholla")
-- needs ZERO schema change.
--
-- The hierarchy is expressed by (parent_layer_key, parent_feature_id) pointing
-- at another row's (layer_key, feature_id) within the same candidate.
-- ============================================================================

CREATE TABLE IF NOT EXISTS geo_layers (
    candidate_id       TEXT NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    layer_key          TEXT NOT NULL,          -- 'ward' | 'sector' | 'building' | ...
    feature_id         TEXT NOT NULL,          -- unique within (candidate_id, layer_key)
    parent_layer_key   TEXT,                   -- which layer this nests under (null = root)
    parent_feature_id  TEXT,                   -- the parent row's feature_id

    name               TEXT,                   -- display label
    code               TEXT,                   -- optional external code

    -- Common numeric stats kept as real columns so the map can shade/aggregate
    -- without digging into JSONB. All nullable.
    total_population   INTEGER,
    male_count         INTEGER,
    female_count       INTEGER,

    -- Point layers (e.g. polling stations) store coordinates; polygon layers
    -- store geometry. Either/both may be set.
    latitude           DOUBLE PRECISION,
    longitude          DOUBLE PRECISION,
    geometry           JSONB,                  -- GeoJSON geometry object

    props              JSONB NOT NULL DEFAULT '{}'::jsonb,  -- everything else from source

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (candidate_id, layer_key, feature_id)
);

-- Fetch a whole layer for a candidate (root render)
CREATE INDEX IF NOT EXISTS idx_geo_layers_layer
    ON geo_layers (candidate_id, layer_key);

-- Fetch a layer's children scoped to one parent (drill-down)
CREATE INDEX IF NOT EXISTS idx_geo_layers_parent
    ON geo_layers (candidate_id, layer_key, parent_feature_id);

-- ----------------------------------------------------------------------------
-- layer_definitions — the per-candidate catalog of which layers exist and how
-- they nest / render. This is the structured form of map_config.layers; the
-- wizard writes here and candidates.map_config is generated from it. Keeping
-- it as a table (not just JSON) lets the upload step attach files to a layer
-- and report row counts.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS layer_definitions (
    candidate_id    TEXT NOT NULL REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    layer_key       TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    display_name_bn TEXT,
    parent_layer_key TEXT,                     -- null = root
    ordinal         INTEGER NOT NULL DEFAULT 0,  -- shallow→deep ordering
    geometry_type   TEXT NOT NULL DEFAULT 'polygon' CHECK (geometry_type IN ('polygon','point')),
    is_leaf         BOOLEAN NOT NULL DEFAULT FALSE,  -- true = no drilling (e.g. building/voter)
    click_action    TEXT NOT NULL DEFAULT 'drill',   -- 'drill' | 'select' | 'modal:canvassed_voters'
    color_by        TEXT NOT NULL DEFAULT 'uniform', -- 'uniform' | 'bucket' | 'canvassed'
    style           JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_count       INTEGER NOT NULL DEFAULT 0,    -- updated after each import
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (candidate_id, layer_key)
);

CREATE INDEX IF NOT EXISTS idx_layer_definitions_candidate
    ON layer_definitions (candidate_id, ordinal);
