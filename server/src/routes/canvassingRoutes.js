const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/canvassingController');

router.post('/submit', verifyToken, asyncHandler(c.submit));
router.get('/history/:voter_id', verifyToken, asyncHandler(c.history));
router.get('/locations/:village_id', verifyToken, asyncHandler(c.locationsByVillage));
router.get('/all-locations', verifyToken, asyncHandler(c.allLocations));
router.post('/voter-locations', verifyToken, asyncHandler(c.voterLocations));
router.get('/voter-records', verifyToken, asyncHandler(c.voterRecords));
// Party-wide survey view for the Political Admin (party-isolated).
router.get('/party-records', verifyToken, asyncHandler(c.partyRecords));
router.get('/party-stats', verifyToken, asyncHandler(c.partyStats));
router.get('/party-persuadable', verifyToken, asyncHandler(c.partyPersuadable));
// §10: full cross-campaign voter timeline — Political Admin / Main Admin only.
router.get('/voter-history/:voter_id', verifyToken, asyncHandler(c.voterHistory));
router.get('/stats', verifyToken, asyncHandler(c.stats));

module.exports = router;
