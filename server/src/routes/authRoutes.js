const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/authController');

router.post('/login', asyncHandler(c.login));
router.post('/logout', verifyToken, asyncHandler(c.logout));
router.get('/me', verifyToken, asyncHandler(c.me));
router.post('/verify', verifyToken, asyncHandler(c.verify));
router.post('/switch-candidate', verifyToken, asyncHandler(c.switchCandidate));

module.exports = router;
