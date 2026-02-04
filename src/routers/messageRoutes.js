const express = require('express');
const { getAllMessages, getSingleMessage, updateMessageStatus, deleteMessage } = require('../controllers/messageController');
const { protect } = require('../middleweres/protect');

const router = express.Router();

router.use(protect)

// Get all messages for a user
router.get('/', getAllMessages);

// Get a specific message
router.get('/:messageId', getSingleMessage);

// Update message status
router.patch('/:messageId/status', updateMessageStatus);

// Delete a message
router.delete('/:messageId', deleteMessage);

module.exports = router; 