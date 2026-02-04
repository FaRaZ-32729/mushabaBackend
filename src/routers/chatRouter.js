const express = require("express");
const { getAllChats, getPersonalChat, existingChat, getGroupChat, getSingleChat, newChat, chatMessages, newMessage, markMessage, getLastImageMessage, getLastVideoMessage, getLastVoiceMessage } = require("../controllers/chatController");
const { protect } = require("../middleweres/protect");

const router = express.Router();

router.get('/', protect, getAllChats);
router.get('/personal', protect, getPersonalChat);
router.post('/check', protect, existingChat);
router.get('/connection/:connectionId', protect, getGroupChat);
router.get('/:chatId', protect, getSingleChat);
router.post('/', protect, newChat);
router.get('/:chatId/messages', protect, chatMessages);
router.post('/:chatId/messages', protect, newMessage);
router.post('/:chatId/read', protect, markMessage);
router.get('/:chatId/last-image', getLastImageMessage);
router.get('/:chatId/last-video', getLastVideoMessage);
router.get('/:chatId/last-voice', getLastVoiceMessage);