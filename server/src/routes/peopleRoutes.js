'use strict';
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/peopleController');
const userModel = require('../models/userModel');

router.use(verifyToken);

// ── Political candidates (super-admin) ────────────────────────────────────────
router.post  ('/candidates',                      asyncHandler(c.createCandidate));
router.get   ('/candidates',                      asyncHandler(c.listCandidates));
router.put   ('/candidates/:user_id/constituency',asyncHandler(c.assignConstituency));

// ── Volunteers (candidate or super-admin) ─────────────────────────────────────
router.post  ('/volunteers',                      asyncHandler(c.createOrAssignVolunteer));
router.get   ('/volunteers',                      asyncHandler(c.listVolunteers));
router.put   ('/volunteers/:user_id/wards',       asyncHandler(c.updateVolunteerWards));
router.delete('/volunteers/:user_id',             asyncHandler(c.removeVolunteer));

// ── User search (for "select existing volunteer" picker) ──────────────────────
router.get('/users/search', asyncHandler(async (req, res) => {
    if (!req.user?.is_super_admin && req.user?.role !== 'candidate') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const users = await userModel.searchAll({ search: req.query.q, limit: 20 });
    res.json({ success: true, users });
}));

module.exports = router;
