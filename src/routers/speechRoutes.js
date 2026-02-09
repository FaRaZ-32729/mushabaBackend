const express = require('express');
const { handleSpeechToText, handleTextToSpeech } = require('../controllers/speechController');


const router = express.Router();
router.use(express.json({ limit: '20mb' }));

// POST /api/speech/stt
router.post('/stt', handleSpeechToText);

// POST /api/speech/tts
router.post('/tts', handleTextToSpeech);

module.exports = router;


