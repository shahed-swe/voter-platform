const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/layerDefinitionController');

// verifyToken + scopeToCandidate applied globally in routes/index.js.
// Super-admin gate enforced in the controller for mutations.

router.get('/', asyncHandler(c.list));
router.put('/', asyncHandler(c.replaceAll));
router.put('/filters', asyncHandler(c.saveFilters));

module.exports = router;
