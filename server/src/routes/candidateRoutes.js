const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/candidateController');

// verifyToken applied globally in routes/index.js; we DO NOT apply
// scopeToCandidate here because these endpoints are cross-candidate
// (used by the switcher and super-admin to operate on other candidates).

router.get('/',                              asyncHandler(c.list));
router.get('/:candidate_id',                 asyncHandler(c.getOne));
router.post('/',                             asyncHandler(c.create));
router.post('/:candidate_id/users',          asyncHandler(c.grantUser));
router.delete('/:candidate_id/users/:user_id', asyncHandler(c.revokeUser));

module.exports = router;
