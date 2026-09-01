'use strict';
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/selectionController');

router.use(verifyToken);

router.get ('/', asyncHandler(c.list));   // the party's final picks per seat
router.post('/', asyncHandler(c.select)); // make/change the selection + handover

module.exports = router;
