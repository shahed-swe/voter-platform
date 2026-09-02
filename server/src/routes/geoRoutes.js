const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/geoController');

// All geo endpoints return GeoJSON FeatureCollections.
router.use(verifyToken);

router.get('/villages',                       asyncHandler(c.villages));
router.get('/wards',                          asyncHandler(c.wards));
router.get('/voter-areas',                    asyncHandler(c.voterAreas));
router.get('/buildings/:voter_area_id',       asyncHandler(c.buildings));

module.exports = router;
