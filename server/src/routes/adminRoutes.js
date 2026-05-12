const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole } = require('../middleware/auth');
const c = require('../controllers/adminUserController');
const cache = require('../controllers/cacheController');

router.use(verifyToken);

// User management
router.get('/users', asyncHandler(c.listUsers));
router.post('/users', asyncHandler(c.createUser));
router.put('/users/:user_id', asyncHandler(c.updateUser));
router.put('/users/:user_id/password', asyncHandler(c.changePassword));
router.put('/users/:user_id/username', asyncHandler(c.changeUsername));
router.delete('/users/:user_id', requireRole('admin'), asyncHandler(c.deleteUser));

// Assignments per-user
router.get('/users/:user_id/assignments', asyncHandler(c.listAssignmentsForUser));
router.post('/users/:user_id/assignments', asyncHandler(c.createAssignment));
router.delete('/users/:user_id/assignments/:assignment_id', asyncHandler(c.deleteAssignment));

// All assignments + cache
router.get('/assignments', asyncHandler(c.listAllAssignments));
router.post('/clear-cache', asyncHandler(cache.clear));

module.exports = router;
