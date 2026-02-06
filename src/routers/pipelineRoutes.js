const express = require('express');
const tts_sttPipeline = require('../services/pipeline');


const router = express.Router();
router.use(express.json({ limit: '20mb' }));

router.post('/stt-translate-tts', tts_sttPipeline);

module.exports = router;