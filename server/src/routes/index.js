const router = require('express').Router();

router.use('/auth',        require('./authRoutes'));
router.use('/admin',       require('./adminRoutes'));
router.use('/voters',      require('./voterRoutes'));
router.use('/villages',    require('./villageRoutes'));
router.use('/canvassing',  require('./canvassingRoutes'));
router.use('/media',       require('./mediaRoutes'));
router.use('/analytics',   require('./analyticsRoutes'));
router.use('/cache',       require('./cacheRoutes'));
router.use('/geo',         require('./geoRoutes'));

// Urban / constituency-style API (works for any tenant that loads wards/buildings)
router.use('/urban',       require('./urbanRoutes'));

// Tenant-prefixed legacy aliases — keep old clients working without changing URLs.
const config = require('../config');
const tenantPrefix = `/${config.tenant.id}`;
router.use(`${tenantPrefix}/auth`,       require('./authRoutes'));
router.use(`${tenantPrefix}/voters`,     require('./voterRoutes'));
router.use(`${tenantPrefix}/villages`,   require('./villageRoutes'));
router.use(`${tenantPrefix}/canvassing`, require('./canvassingRoutes'));
router.use(`${tenantPrefix}/analytics`,  require('./analyticsRoutes'));
router.use(`${tenantPrefix}`,            require('./urbanRoutes'));

module.exports = router;
