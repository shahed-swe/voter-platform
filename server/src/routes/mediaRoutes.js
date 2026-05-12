const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const c = require('../controllers/mediaController');

router.use(verifyToken);

router.post('/upload', upload.single('file'), asyncHandler(c.upload));
router.get('/serve/:media_id', asyncHandler(c.serve));
router.get('/canvass/:canvass_id', asyncHandler(c.byCanvass));
router.get('/voter/:voter_id', asyncHandler(c.byVoter));
router.get('/file/:media_id', asyncHandler(c.getById));
router.get('/:media_id', asyncHandler(c.getById));
router.delete('/delete/photo/:canvass_id', asyncHandler(c.deletePhoto));
router.delete('/delete/audio/:canvass_id', asyncHandler(c.deleteAudio));

module.exports = router;
