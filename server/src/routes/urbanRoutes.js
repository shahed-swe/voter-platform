const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const c = require('../controllers/urbanController');

// Note: verifyToken + scopeToCandidate are applied globally in routes/index.js

router.get('/constituencies', asyncHandler(c.constituencies));
router.get('/wards', asyncHandler(c.wards));
router.get('/voter-areas', asyncHandler(c.voterAreas));
router.get('/hierarchy', asyncHandler(c.hierarchy));
router.get('/voter-area-buildings/:voterAreaName', asyncHandler(c.buildingsForVoterArea));
router.get('/buildings/visited/:voterAreaId', asyncHandler(c.buildingsVisited));
router.get('/buildings/:building_id/canvassed-voters', asyncHandler(c.canvassedVotersForBuilding));
router.get('/polling-stations/:wardId', asyncHandler(c.pollingStations));
router.get('/polling-stations-filter', asyncHandler(c.pollingStationsFilter));

module.exports = router;
