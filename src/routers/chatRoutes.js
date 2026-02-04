const express = require("express");
const { getAllChats, getPersonalChat, existingChat, getGroupChat, getSingleChat, newChat, chatMessages, newMessage, markMessage, getLastImageMessage, getLastVideoMessage, getLastVoiceMessage } = require("../controllers/chatController");
const { protect } = require("../middleweres/protect");

const router = express.Router();

// Get all chats for a user
router.get('/', protect, getAllChats);
// Get personal chat for current user
router.get('/personal', protect, getPersonalChat);
// Check for existing chat by participants and type
router.post('/check', protect, existingChat);
// Get group chat by connectionId
router.get('/connection/:connectionId', protect, getGroupChat);
// Get a specific chat
router.get('/:chatId', protect, getSingleChat);
// Create a new chat
router.post('/', protect, newChat);
// Get messages for a chat
router.get('/:chatId/messages', protect, chatMessages);
// Send a message
router.post('/:chatId/messages', protect, newMessage);
// Mark messages as read
router.post('/:chatId/read', protect, markMessage);

router.get('/:chatId/last-image', getLastImageMessage);
router.get('/:chatId/last-video', getLastVideoMessage);
router.get('/:chatId/last-voice', getLastVoiceMessage);

module.exports = router; 