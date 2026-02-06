const express = require('express');
const transcribeAudio = require('../controllers/speechController');

const router = express.Router();
router.use(express.json({ limit: '20mb' }));

router.post('/transcribe', transcribeAudio);

module.exports = router; 