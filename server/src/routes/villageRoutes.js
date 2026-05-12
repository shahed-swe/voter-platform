const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const c = require('../controllers/villageController');

router.get('/filters', verifyToken, asyncHandler(c.filters));
router.post('/filtered', verifyToken, asyncHandler(c.listFiltered));
router.get('/data', verifyToken, asyncHandler(c.listData));
router.get('/with-voters', verifyToken, asyncHandler(c.withVoters));
router.get('/stats', optionalAuth, asyncHandler(c.stats));
router.post('/geometry', optionalAuth, asyncHandler(c.geometry));
router.get('/:village_id', verifyToken, asyncHandler(c.getById));

module.exports = router;
