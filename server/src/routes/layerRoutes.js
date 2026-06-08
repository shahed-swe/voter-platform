const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/genericGeoController');

// verifyToken + scopeToCandidate are applied globally in routes/index.js
// All endpoints are scoped to the active candidate.

// ---- geo_layers store (generic, wizard-onboarded candidates) ----
// Registered BEFORE the /:source routes so the literal "geo" prefix wins.
router.get('/geo/:layer_key',                         asyncHandler(c.geoLayerAll));
router.get('/geo/:layer_key/by/:parent_feature_id',   asyncHandler(c.geoLayerByParent));

// ---- dedicated-table sources (legacy: dhaka13, panchagarh) ----
// Discovery — list every whitelisted source + its column metadata
router.get('/sources', asyncHandler(c.listSources));

// All features of a source (no parent filter)
router.get('/:source', asyncHandler(c.listAll));

// Features of a source where parent_fk = parent_value
router.get('/:source/by/:parent_fk/:parent_value', asyncHandler(c.listByParent));

module.exports = router;
