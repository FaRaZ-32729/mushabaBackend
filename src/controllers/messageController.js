const Chat = require('../models/chatSchema');
const Message = require('../models/messageSchema');

// Get all messages for a user
const getAllMessages = async (req, res) => {
    try {
        const messages = await Message.find({ sender: req.user.id })
            .populate('sender', 'name profilePicture')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
};

// Get a specific message
const getSingleMessage = async (req, res) => {
    try {
        const message = await Message.findOne({
            _id: req.params.messageId,
            sender: req.user.id
        }).populate('sender', 'name profilePicture');

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        res.json({
            success: true,
            message
        });
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching message'
        });
    }
};

// Update message status
const updateMessageStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const message = await Message.findOneAndUpdate(
            { _id: req.params.messageId, sender: req.user.id },
            { status },
            { new: true }
        ).populate('sender', 'name profilePicture');

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Emit socket event for status update
        const io = req.app.get('io');
        console.log('[SOCKET_DEBUG] IO instance available for messageStatus:', !!io);
        console.log('[SOCKET_DEBUG] IO engine clients count:', io.engine?.clientsCount);
        const chat = await Chat.findById(message.chatId);
        chat.participants.forEach(participantId => {
            io.to(`user:${participantId}`).emit('messageStatus', {
                messageId: message._id,
                status
            });
        });

        res.json({
            success: true,
            message
        });
    } catch (error) {
        console.error('Error updating message status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating message status'
        });
    }
};

// Delete a message
const deleteMessage = async (req, res) => {
    try {
        const message = await Message.findOneAndDelete({
            _id: req.params.messageId,
            sender: req.user.id
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Emit socket event for message deletion
        const io = req.app.get('io');
        console.log('[SOCKET_DEBUG] IO instance available for messageDeleted:', !!io);
        console.log('[SOCKET_DEBUG] IO engine clients count:', io.engine?.clientsCount);
        const chat = await Chat.findById(message.chatId);
        chat.participants.forEach(participantId => {
            io.to(`user:${participantId}`).emit('messageDeleted', {
                messageId: message._id
            });
        });

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message'
        });
    }
};

module.exports = {
    getAllMessages,
    getSingleMessage,
    updateMessageStatus,
    deleteMessage
}