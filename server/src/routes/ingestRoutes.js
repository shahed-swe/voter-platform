const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/ingestController');

// verifyToken + scopeToCandidate applied globally in routes/index.js.
// Super-admin gate is enforced inside the controller.

router.post('/upload', c.upload.single('file'), asyncHandler(c.uploadAndPreview));
router.post('/commit', asyncHandler(c.commit));

module.exports = router;
