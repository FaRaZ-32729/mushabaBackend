
const express = require('express');
const generateAudio = require('../controllers/ttsController');

const router = express.Router();
router.use(express.json());

router.post('/generate-audio', generateAudio);

module.exports = router;