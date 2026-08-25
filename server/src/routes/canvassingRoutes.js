const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const c = require('../controllers/canvassingController');

router.post('/submit', verifyToken, asyncHandler(c.submit));
router.get('/history/:voter_id', verifyToken, asyncHandler(c.history));
router.get('/locations/:village_id', verifyToken, asyncHandler(c.locationsByVillage));
router.get('/all-locations', verifyToken, asyncHandler(c.allLocations));
router.post('/voter-locations', verifyToken, asyncHandler(c.voterLocations));
router.get('/voter-records', verifyToken, asyncHandler(c.voterRecords));
router.get('/stats', optionalAuth, asyncHandler(c.stats));

module.exports = router;
