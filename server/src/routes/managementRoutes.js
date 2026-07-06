'use strict';
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/managementController');

router.use(verifyToken);

router.get   ('/context',              asyncHandler(c.context));
router.get   ('/wards',                asyncHandler(c.wards));
router.get   ('/voter-areas',          asyncHandler(c.voterAreas));
router.get   ('/users',                asyncHandler(c.listUsers));
router.post  ('/users',                asyncHandler(c.createUser));
router.put   ('/users/:user_id/region',asyncHandler(c.updateRegion));
router.delete('/users/:user_id',       asyncHandler(c.removeUser));

module.exports = router;
