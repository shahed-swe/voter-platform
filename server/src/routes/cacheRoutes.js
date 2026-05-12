const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/cacheController');

router.get('/status', verifyToken, asyncHandler(c.status));
router.post('/force-clear', verifyToken, asyncHandler(c.clear));

module.exports = router;
