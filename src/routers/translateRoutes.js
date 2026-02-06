const express = require('express');
const { translateText, translateToFile } = require('../controllers/translateController');

const router = express.Router();
router.use(express.json({ limit: '5mb' }));

router.post('/translate', translateText);

router.post('/translate-to-file', translateToFile);

module.exports = router;