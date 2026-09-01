const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/analyticsController');

router.use(verifyToken);

router.get('/overview', asyncHandler(c.overview));
router.get('/support-distribution', asyncHandler(c.supportDistribution));
router.get('/demographics', asyncHandler(c.demographics));
router.get('/village-performance', asyncHandler(c.villagePerformance));
router.get('/canvasser-performance', asyncHandler(c.canvasserPerformance));
router.get('/daily-trends', asyncHandler(c.dailyTrends));
router.get('/issues', asyncHandler(c.issues));
router.get('/issues-records', asyncHandler(c.issuesRecords));
router.get('/occupations', asyncHandler(c.occupations));
router.get('/income-distribution', asyncHandler(c.incomeDistribution));
router.get('/canvassing-records', asyncHandler(c.canvassingRecords));
router.get('/canvassers', asyncHandler(c.canvasserOptions));

module.exports = router;
