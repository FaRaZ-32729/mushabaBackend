const express = require('express');
const { getNotifications, markAsRead, markAllAsRead, deleteAllNotifications, deleteSingleNotification, createUserNotification } = require('../controllers/notificationController');
const router = express.Router();

// Get user notifications
router.get('/', getNotifications);

// Mark notification as read
router.put('/:notificationId/read', markAsRead);

// Mark all notifications as read
router.patch('/read-all', markAllAsRead);

// Delete all notifications
router.delete('/all', deleteAllNotifications);

// Delete notification
router.delete('/:notificationId', deleteSingleNotification);

// Create notification
router.post('/', createUserNotification);

module.exports = router; 