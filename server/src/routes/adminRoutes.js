const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, requireRole } = require('../middleware/auth');
const c = require('../controllers/adminUserController');
const cache = require('../controllers/cacheController');

router.use(verifyToken);

// User management
router.get('/users', asyncHandler(c.listUsers));
router.get('/multi-party-volunteers', asyncHandler(c.multiPartyVolunteers));
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

// Test the email/SMTP config (#13). Super-admin only. Sends a test message so
// the operator can confirm EMAIL_USER / EMAIL_PASS (Gmail app password) work.
router.post('/test-email', requireRole('admin'), asyncHandler(async (req, res) => {
    const emailService = require('../services/emailService');
    const config = require('../config');
    const to = req.body?.to || config.email.from || config.email.user;
    if (!config.email.enabled) {
        return res.status(400).json({ success: false, error: 'Email is disabled (set EMAIL_ENABLED=true and credentials).' });
    }
    if (!to) return res.status(400).json({ success: false, error: 'No recipient (pass { to } or set EMAIL_FROM).' });
    const result = await emailService.sendMail({
        to,
        subject: `${config.tenant.name} — test email`,
        html: `<p>✅ Email is configured correctly for <strong>${config.tenant.name}</strong>.</p>`,
        text: `Email is configured correctly for ${config.tenant.name}.`,
    });
    res.json({ success: true, ...result, to });
}));

module.exports = router;
