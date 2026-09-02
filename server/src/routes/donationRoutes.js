'use strict';
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/donationController');

router.use(verifyToken);

router.get ('/volunteers',           asyncHandler(c.findVolunteers)); // donor: party volunteer finder
router.post('/',                     asyncHandler(c.create));         // donor: record a donation
router.get ('/mine',                 asyncHandler(c.mine));           // donor: own record + totals
router.get ('/received',             asyncHandler(c.received));       // volunteer: donations to me
router.post('/:donation_id/confirm', asyncHandler(c.confirm));        // volunteer: confirm receipt
router.get ('/party',                asyncHandler(c.partyLedger));    // Political Admin: party ledger

module.exports = router;
