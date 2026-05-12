const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/filterOptionsController');

// verifyToken + scopeToCandidate applied globally in routes/index.js

router.get('/', asyncHandler(c.list));

module.exports = router;
