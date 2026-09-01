const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { scopeToCandidate } = require('../middleware/scope');

// Auth routes — public + already manage their own JWT.
router.use('/auth', require('./authRoutes'));

// Candidate management endpoints sit BEFORE the scope middleware because
// they operate ACROSS candidates (super-admin tooling + the switcher API).
// They require auth but not an active candidate context.
router.use('/candidates', verifyToken, require('./candidateRoutes'));

// People management: political candidates + volunteers (cross-candidate, no scope needed).
router.use('/people', require('./peopleRoutes'));

// Unified hierarchy management (candidate → admin → sub-admin → volunteer). #12
router.use('/management', require('./managementRoutes'));

// Donations (§9): donor ↔ volunteer money records + the party ledger.
// Party-scoped, not constituency-scoped, so it sits before the scope middleware.
router.use('/donations', require('./donationRoutes'));

// Everything else requires authentication AND a candidate scope (set on req.candidateId).
router.use(verifyToken, scopeToCandidate);

router.use('/admin',       require('./adminRoutes'));
router.use('/voters',      require('./voterRoutes'));
router.use('/villages',    require('./villageRoutes'));
router.use('/canvassing',  require('./canvassingRoutes'));
router.use('/media',       require('./mediaRoutes'));
router.use('/analytics',   require('./analyticsRoutes'));
router.use('/cache',       require('./cacheRoutes'));
router.use('/geo',         require('./geoRoutes'));
router.use('/urban',       require('./urbanRoutes'));
router.use('/filter-options', require('./filterOptionsRoutes'));
// Generic layer endpoints — drive the config-driven <DynamicMap>. Specific
// /api/geo/* endpoints above remain available for legacy Urban/Rural dashboards.
router.use('/layers',         require('./layerRoutes'));
// Per-candidate layer catalog (wizard designer). Writing it regenerates map_config.
router.use('/layer-definitions', require('./layerDefinitionRoutes'));
// Self-serve data onboarding: upload + preview + ingest into geo_layers.
router.use('/ingest',         require('./ingestRoutes'));

module.exports = router;
