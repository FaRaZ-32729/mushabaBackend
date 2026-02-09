const express = require('express');
const { protect } = require('../middleweres/protect');
const { gemeniChat, checkHealth } = require('../controllers/geminiChatController');

const router = express.Router();

router.use(protect);

router.post('/chat', gemeniChat);
router.get('/health', checkHealth);

module.exports = router;