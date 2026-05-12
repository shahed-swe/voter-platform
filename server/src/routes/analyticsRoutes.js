const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const c = require('../controllers/analyticsController');

router.use(optionalAuth);

router.get('/overview', asyncHandler(c.overview));
router.get('/support-distribution', asyncHandler(c.supportDistribution));
router.get('/demographics', asyncHandler(c.demographics));
router.get('/village-performance', asyncHandler(c.villagePerformance));
router.get('/canvasser-performance', asyncHandler(c.canvasserPerformance));
router.get('/daily-trends', asyncHandler(c.dailyTrends));
router.get('/issues', asyncHandler(c.issues));
router.get('/canvassing-records', asyncHandler(c.canvassingRecords));

module.exports = router;
