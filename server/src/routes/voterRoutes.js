const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/voterController');

router.use(verifyToken);

router.get('/areas', asyncHandler(c.listVoterAreas));
router.get('/areas/:voter_area/stats', asyncHandler(c.voterAreaStats));
router.get('/by-village/:village_id', asyncHandler(c.byVillage));
router.get('/by-voter-area/:voter_area', asyncHandler(c.byVoterArea));
router.post('/by-voter-areas', asyncHandler(c.byVoterAreas));
router.get('/search/:query', asyncHandler(c.search));
router.post('/statistics/aggregated', asyncHandler(c.aggregatedStats));
router.get('/:voter_id', asyncHandler(c.getById));

module.exports = router;
