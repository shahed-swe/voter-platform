const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { scopeToCandidate } = require('../middleware/scope');

// Auth routes — public + already manage their own JWT.
router.use('/auth', require('./authRoutes'));

// Candidate management endpoints sit BEFORE the scope middleware because
// they operate ACROSS candidates (super-admin tooling + the switcher API).
// They require auth but not an active candidate context.
router.use('/candidates', verifyToken, require('./candidateRoutes'));

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

module.exports = router;
