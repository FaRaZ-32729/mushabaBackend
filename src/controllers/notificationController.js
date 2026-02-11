const Notification = require('../models/notificationSchema');
const webSocketService = require('../services/webSocketService');
const mongoose = require('mongoose');

// Get user notifications
const getNotifications = async (req, res) => {
    console.log(" ✅ logged user in get notification controller 🚀🚀🚀",req.user)
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);

        console.log(">>>>>>>>> hellow faraz now i am getting notifications correctly")

        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications'
        });
    }
};

// Mark notification as read
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.notificationId,
                userId: req.user.id
            },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            notification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read'
        });
    }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, read: false },
            { read: true }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read'
        });
    }
};

// Delete all notifications
const deleteAllNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user.id });

        res.json({
            success: true,
            message: 'All notifications deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting all notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting all notifications'
        });
    }
};

// Delete notification
const deleteSingleNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.notificationId,
            userId: req.user.id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting notification'
        });
    }
};

// Create notification
const createUserNotification = async (req, res) => {
    try {
        const { type, content, recipientId } = req.body;

        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        recipient.notifications.push({
            type,
            content,
            sender: req.user.id
        });

        await recipient.save();

        // Emit socket event
        const io = req.app.get('io');
        console.log('[SOCKET_DEBUG] IO instance available for newNotification (route):', !!io);
        console.log('[SOCKET_DEBUG] IO engine clients count:', io.engine?.clientsCount);
        io.to(`user:${recipientId}`).emit('newNotification', {
            type,
            content,
            sender: req.user.id
        });

        res.status(201).json({
            success: true,
            message: 'Notification created successfully'
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating notification'
        });
    }
};

// Create notification (internal use) - ENHANCED with real-time delivery
const createNotification = async (userId, type, message, data = {}) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.error('[NOTIFICATION_DEBUG] Invalid user ID for notification:', userId);
            throw new Error('Invalid user ID');
        }

        console.log('[NOTIFICATION_DEBUG] Creating notification:', {
            userId,
            type,
            message,
            data
        });

        const notification = new Notification({
            userId: new mongoose.Types.ObjectId(userId),
            type,
            message,
            data,
            read: false,
            createdAt: new Date()
        });

        const savedNotification = await notification.save();
        console.log('[NOTIFICATION_DEBUG] Notification saved successfully:', savedNotification._id);

        // ENHANCED: Emit socket event for real-time update using WebSocket service
        try {
            console.log('[NOTIFICATION_DEBUG] Attempting to emit real-time notification...');
            // Import WebSocket service directly
            console.log('[NOTIFICATION_DEBUG] WebSocket service imported:', !!webSocketService);

            if (webSocketService && webSocketService.emitNotificationToUser) {
                console.log('[NOTIFICATION_DEBUG] Emitting real-time notification to user:', userId);
                console.log('[NOTIFICATION_DEBUG] WebSocket service methods available:', {
                    emitNotificationToUser: !!webSocketService.emitNotificationToUser,
                    emitNotificationToConnection: !!webSocketService.emitNotificationToConnection
                });

                // Emit to the specific user who should receive the notification
                webSocketService.emitNotificationToUser(userId, {
                    _id: savedNotification._id,
                    type: savedNotification.type,
                    message: savedNotification.message,
                    data: savedNotification.data,
                    read: savedNotification.read,
                    createdAt: savedNotification.createdAt
                });

                // If it's connection-related, also emit to connection room for other users
                if (data.connectionId) {
                    console.log('[NOTIFICATION_DEBUG] Emitting connection notification to room:', data.connectionId);
                    webSocketService.emitNotificationToConnection(data.connectionId, {
                        _id: savedNotification._id,
                        type: savedNotification.type,
                        message: savedNotification.message,
                        data: savedNotification.data,
                        read: savedNotification.read,
                        createdAt: savedNotification.createdAt
                    }, userId); // Exclude the user who already got the direct notification
                }

                console.log('[NOTIFICATION_DEBUG] Real-time notification emitted successfully');
            } else {
                console.warn('[NOTIFICATION_DEBUG] WebSocket service not available for notification');
            }
        } catch (socketError) {
            console.error('[NOTIFICATION_DEBUG] Error emitting socket notification (non-critical):', socketError);
            console.log('[NOTIFICATION_DEBUG] Socket error details:', {
                error: socketError.message,
                stack: socketError.stack
            });
            // Don't throw error - notification was saved successfully
        }

        return savedNotification;
    } catch (error) {
        console.error('[NOTIFICATION_DEBUG] Error creating notification:', error);
        console.log('[NOTIFICATION_DEBUG] Error details:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

module.exports = {
    deleteAllNotifications,
    deleteSingleNotification,
    createUserNotification,
    getNotifications,
    markAsRead,
    markAllAsRead,
    createNotification
}; 