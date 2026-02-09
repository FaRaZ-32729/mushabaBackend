const express = require('express');
const transcribeAudio = require('../controllers/voiceController');

const router = express.Router();
router.use(express.json({ limit: '20mb' }));

router.post('/transcribe', transcribeAudio);

module.exports = router; 