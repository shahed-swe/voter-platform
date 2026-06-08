-- ============================================================================
-- 013 OVERLAY LAYERS
-- An overlay layer (e.g. polling stations) renders as toggleable markers on
-- top of whatever drill level is showing — it's NOT part of the drill chain.
-- ============================================================================

ALTER TABLE layer_definitions
    ADD COLUMN IF NOT EXISTS is_overlay BOOLEAN NOT NULL DEFAULT FALSE;
