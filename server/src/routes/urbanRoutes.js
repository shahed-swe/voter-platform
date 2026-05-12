const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const c = require('../controllers/urbanController');

router.get('/constituencies', optionalAuth, asyncHandler(c.constituencies));
router.get('/wards', verifyToken, asyncHandler(c.wards));
router.get('/voter-areas', verifyToken, asyncHandler(c.voterAreas));
router.get('/hierarchy', verifyToken, asyncHandler(c.hierarchy));
router.get('/voter-area-buildings/:voterAreaName', optionalAuth, asyncHandler(c.buildingsForVoterArea));
router.get('/buildings/geojson/:voterAreaName', verifyToken, asyncHandler(c.buildingsGeojson));
router.get('/buildings/visited/:voterAreaId', verifyToken, asyncHandler(c.buildingsVisited));
router.get('/buildings/:building_id/canvassed-voters', verifyToken, asyncHandler(c.canvassedVotersForBuilding));
router.get('/polling-stations/:wardId', optionalAuth, asyncHandler(c.pollingStations));
router.get('/polling-stations-filter', optionalAuth, asyncHandler(c.pollingStationsFilter));

module.exports = router;
