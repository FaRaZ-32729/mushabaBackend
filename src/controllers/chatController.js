const Chat = require('../models/chatSchema');
const Message = require('../models/messageSchema');
const mongoose = require('mongoose');

// Get all chats for a user
const getAllChats = async (req, res) => {
    try {
        const chats = await Chat.find({
            'participants.userId': req.user.id,
            'participants.status': 'active'
        })
            .populate('participants.userId', 'name profilePicture status')
            .populate('lastMessage')
            .sort({ lastActivity: -1 });

        res.json({
            success: true,
            chats
        });
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching chats'
        });
    }
};

// Get personal chat for current user
const getPersonalChat = async (req, res) => {
    try {
        const currentUserId = req.user.id;

        console.warn('[PERSONAL_CHAT] Fetching personal chat for user:', currentUserId);

        const personalChat = await Chat.findOne({
            type: 'personal',
            'participants.userId': currentUserId,
            'participants.status': 'active'
        }).populate('participants.userId', 'name username');

        if (!personalChat) {
            console.warn('[PERSONAL_CHAT] Personal chat not found for user:', currentUserId);
            return res.status(404).json({
                success: false,
                message: 'Personal chat not found'
            });
        }

        console.warn('[PERSONAL_CHAT] Personal chat found:', personalChat._id);
        res.json({
            success: true,
            chat: personalChat
        });
    } catch (error) {
        console.warn('[PERSONAL_CHAT] Error fetching personal chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching personal chat',
            error: error.message
        });
    }
};

// Check for existing chat by participants and type
const existingChat = async (req, res) => {
    try {
        const { type, participants } = req.body;
        const currentUserId = req.user.id;

        console.log('Check existing chat - Type:', type, 'Participants count:', participants?.length);

        if (!type || !participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                message: 'Type and participants array are required'
            });
        }

        // Validate participant IDs
        const validParticipants = participants.filter(p => mongoose.Types.ObjectId.isValid(p));
        if (validParticipants.length !== participants.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid participant IDs'
            });
        }

        let existingChat = null;

        if (type === 'private' && validParticipants.length === 1) {
            // For private chats, check if chat exists between current user and the participant
            existingChat = await Chat.findOne({
                type: 'private',
                'participants.userId': { $all: [currentUserId, validParticipants[0]] },
                'participants.status': 'active'
            }).populate('participants.userId', 'name username');
        } else if (type === 'group') {
            // For group chats, check if any existing group chat contains all the participants
            const allParticipantIds = [currentUserId, ...validParticipants];
            existingChat = await Chat.findOne({
                type: 'group',
                'participants.userId': { $all: allParticipantIds },
                'participants.status': 'active'
            }).populate('participants.userId', 'name username');
        }

        console.log('Check existing chat - Found:', !!existingChat);

        res.json({
            success: true,
            exists: !!existingChat,
            chat: existingChat
        });
    } catch (error) {
        console.error('Error checking existing chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking existing chat',
            error: error.message
        });
    }
};

// Get group chat by connectionId
const getGroupChat = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const currentUserId = req.user.id;

        console.log('Get group chat by connectionId:', connectionId);

        console.log('Get group chat by connectionId - Searching for:', connectionId);

        const chat = await Chat.findOne({
            type: 'group',
            'metadata.connectionId': connectionId
        }).populate('participants.userId', 'name username');

        console.log('Get group chat by connectionId - Found chat:', !!chat);
        if (chat) {
            console.log('Get group chat by connectionId - Chat ID:', chat._id);
            console.log('Get group chat by connectionId - Participants count:', chat.participants.length);
        }

        if (!chat) {
            console.log('Get group chat by connectionId - No chat found, returning 404');
            return res.status(404).json({
                success: false,
                message: 'Group chat not found for this connection'
            });
        }

        res.json({
            success: true,
            chat
        });
    } catch (error) {
        console.error('Error fetching group chat by connectionId:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching group chat',
            error: error.message
        });
    }
};

// Get a specific chat
const getSingleChat = async (req, res) => {
    try {
        const chat = await Chat.findOne({
            _id: req.params.chatId,
            'participants.userId': req.user.id,
            'participants.status': 'active'
        })
            .populate('participants.userId', 'name profilePicture status')
            .populate('lastMessage');

        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        res.json({
            success: true,
            chat
        });
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching chat'
        });
    }
};

// Create a new chat
const newChat = async (req, res) => {
    try {
        console.log('Create chat - Request received');

        const { type, participants, name, description } = req.body;
        const currentUserId = req.user.id;

        console.log('Create chat - Type:', type, 'Participants count:', participants?.length);
        console.log('Create chat - Current user ID:', currentUserId);
        console.log('Create chat - Participants:', participants);

        // Validate participants
        if (!participants || !Array.isArray(participants)) {
            console.log('Create chat - Invalid participants format');
            return res.status(400).json({
                success: false,
                message: 'Participants must be an array'
            });
        }

        // Validate participant IDs
        const validParticipants = participants.filter(p => mongoose.Types.ObjectId.isValid(p));
        if (validParticipants.length !== participants.length) {
            console.log('Create chat - Invalid participant IDs');
            return res.status(400).json({
                success: false,
                message: 'Invalid participant IDs'
            });
        }

        // Remove current user from participants if included
        const filteredParticipants = validParticipants.filter(p => p !== currentUserId);

        // For private chats, check if chat already exists
        if (type === 'private' && filteredParticipants.length === 1) {
            const existingChat = await Chat.findOne({
                type: 'private',
                'participants.userId': { $all: [currentUserId, filteredParticipants[0]] },
                'participants.status': 'active'
            }).populate('participants.userId', 'name username');

            console.log('Create chat - Existing private chat found:', !!existingChat);

            if (existingChat) {
                return res.json({
                    success: true,
                    chat: existingChat
                });
            }

            // Create new private chat
            const allParticipants = [
                { userId: currentUserId, role: 'owner', status: 'active', joinTimestamp: new Date() },
                { userId: filteredParticipants[0], role: 'member', status: 'active', joinTimestamp: new Date() }
            ];

            const chat = new Chat({
                type,
                participants: allParticipants,
                metadata: {
                    name: name,
                    description: description
                }
            });

            await chat.save();
            await chat.populate('participants.userId', 'name username');

            console.log('Create chat - New private chat created');

            return res.status(201).json({
                success: true,
                chat
            });
        }

        // For group chats, check if any existing group chat exists with current participants
        if (type === 'group') {
            // Check if a group chat with the exact same participants already exists
            const allParticipantIds = [currentUserId, ...filteredParticipants];
            const existingGroupChat = await Chat.findOne({
                type: 'group',
                'participants.userId': { $all: allParticipantIds },
                'participants.status': 'active'
            }).populate('participants.userId', 'name username');

            console.log('Create chat - Existing group chat found:', !!existingGroupChat);

            if (existingGroupChat) {
                return res.json({
                    success: true,
                    chat: existingGroupChat
                });
            }

            // Create new group chat if no existing group chat found
            const allParticipants = [
                { userId: currentUserId, role: 'owner', status: 'active', joinTimestamp: new Date() },
                ...filteredParticipants.map(p => ({
                    userId: p,
                    role: 'member',
                    status: 'active',
                    joinTimestamp: new Date()
                }))
            ];

            const chat = new Chat({
                type,
                participants: allParticipants,
                metadata: {
                    name: name || 'Group Chat',
                    description: description || ''
                }
            });

            await chat.save();
            await chat.populate('participants.userId', 'name username');

            console.log('Created new group chat');

            return res.status(201).json({
                success: true,
                chat
            });
        }

        res.status(400).json({
            success: false,
            message: 'Invalid chat type'
        });
    } catch (error) {
        console.error('Error creating chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating chat',
            error: error.message
        });
    }
};

// Get messages for a chat
const chatMessages = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const userId = req.user.id;

        console.log('Fetching messages for chat:', req.params.chatId);

        // Check if user is part of the chat
        const chat = await Chat.findOne({
            _id: req.params.chatId,
            'participants.userId': userId,
            'participants.status': 'active'
        });

        if (!chat) {
            console.log('Chat not found:', req.params.chatId);
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Get user's join timestamp for this chat
        const userParticipant = chat.participants.find(p => p.userId.toString() === userId);
        const joinTimestamp = userParticipant ? userParticipant.joinTimestamp : new Date(0);

        console.log('User join timestamp:', joinTimestamp);

        // Build query to get messages from user's join timestamp onwards
        const messageQuery = {
            chatId: req.params.chatId,
            createdAt: { $gte: joinTimestamp }
        };

        // Get messages with proper population
        const messages = await Message.find(messageQuery)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('sender', 'name username')
            .populate('replyTo')
            .lean();

        // Format messages to ensure content is properly structured
        const formattedMessages = messages.map(msg => {
            // Debug: Log the raw message structure
            if (msg.type === 'image') {
                console.log('Raw image message from DB:', {
                    id: msg._id,
                    type: msg.type,
                    content: msg.content,
                    hasData: !!msg.content?.data,
                    hasUrl: !!msg.content?.url,
                    dataType: typeof msg.content?.data,
                    dataLength: msg.content?.data?.length
                });
            }

            const formattedMsg = {
                ...msg,
                content: msg.content || {}
            };

            // Ensure content has the correct structure based on type
            if (msg.type === 'text') {
                formattedMsg.content = {
                    text: msg.content?.text || ''
                };
            } else if (msg.type === 'image') {
                // Convert Buffer to base64 string for images
                let imageData = null;
                if (msg.content?.data) {
                    if (Buffer.isBuffer(msg.content.data)) {
                        imageData = msg.content.data.toString('base64');
                    } else if (Array.isArray(msg.content.data)) {
                        imageData = Buffer.from(msg.content.data).toString('base64');
                    } else {
                        imageData = msg.content.data;
                    }
                } else if (msg.content?.url && msg.content.url !== '') {
                    // Handle case where image data might be stored in url field
                    imageData = msg.content.url;
                }

                formattedMsg.content = {
                    data: imageData,
                    mimeType: msg.content?.mimeType || 'image/jpeg',
                    name: msg.content?.name || 'image'
                };
            } else if (msg.type === 'voice') {
                // Convert Buffer to base64 string for voice messages
                let audioData = null;
                if (msg.content?.data) {
                    if (Buffer.isBuffer(msg.content.data)) {
                        audioData = msg.content.data.toString('base64');
                    } else if (Array.isArray(msg.content.data)) {
                        audioData = Buffer.from(msg.content.data).toString('base64');
                    } else {
                        audioData = msg.content.data;
                    }
                }

                formattedMsg.content = {
                    data: audioData,
                    mimeType: msg.content?.mimeType || 'audio/m4a',
                    duration: msg.content?.duration || 0
                };
            } else if (msg.type === 'location') {
                formattedMsg.content = {
                    name: msg.content?.name || '',
                    address: msg.content?.address || '',
                    coordinates: msg.content?.coordinates || {
                        latitude: 0,
                        longitude: 0
                    }
                };
            }

            return formattedMsg;
        });

        console.log('Formatted messages count:', formattedMessages.length);

        res.json({
            success: true,
            messages: formattedMessages.reverse(),
            joinTimestamp: joinTimestamp
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Send a message
const newMessage = async (req, res) => {
    try {
        const { type, content, metadata, replyTo } = req.body;
        const senderId = req.user.id;
        console.log(">>>>>>>>>>>>>>>>>>>>>>>new message created")

        console.log('Sending message - Type:', type, 'Chat ID:', req.params.chatId);

        // Check if user is part of the chat
        const chat = await Chat.findOne({
            _id: req.params.chatId,
            'participants.userId': senderId,
            'participants.status': 'active'
        });

        if (!chat) {
            console.log('Chat not found:', req.params.chatId);
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Create message with proper content structure
        const messageData = {
            chatId: req.params.chatId,
            sender: senderId,
            type,
            content: {},
            metadata,
            replyTo
        };

        // Set content based on message type
        switch (type) {
            case 'text':
                if (!content || !content.text) {
                    return res.status(400).json({
                        success: false,
                        message: 'Text message must have content.text'
                    });
                }
                messageData.content = {
                    text: content.text
                };
                break;

            case 'voice':
                if (!content || !content.data) {
                    return res.status(400).json({
                        success: false,
                        message: 'Voice message must have content.data'
                    });
                }

                // Validate audio size
                const audioSize = Buffer.from(content.data, 'base64').length;
                if (audioSize > 3 * 1024 * 1024) { // 3MB limit
                    return res.status(400).json({
                        success: false,
                        message: 'Audio file too large. Maximum size is 3MB'
                    });
                }

                // Validate duration
                if (content.duration > 60) { // 60 seconds limit
                    return res.status(400).json({
                        success: false,
                        message: 'Audio duration too long. Maximum duration is 60 seconds'
                    });
                }

                messageData.content = {
                    data: Buffer.from(content.data, 'base64'),
                    mimeType: content.mimeType || 'audio/m4a',
                    duration: content.duration
                };
                break;

            case 'image':
                if (!content) {
                    return res.status(400).json({
                        success: false,
                        message: 'Image message must have content'
                    });
                }

                // Handle both URL-based and base64-based images
                if (content.url) {
                    // URL-based image (new approach)
                    console.log('Creating URL-based image message:', content.url);
                    messageData.content = {
                        url: content.url,
                        mimeType: content.mimeType || 'image/jpeg',
                        name: content.name || 'image',
                        width: content.width || 0,
                        height: content.height || 0
                    };
                } else if (content.data) {
                    // Base64-based image (legacy approach)
                    console.log('Creating base64-based image message - data length:', content.data.length);
                    messageData.content = {
                        data: Buffer.from(content.data, 'base64'),
                        mimeType: content.mimeType || 'image/jpeg',
                        name: content.name || 'image'
                    };
                    console.log('Image message data stored - buffer length:', messageData.content.data.length);
                } else {
                    return res.status(400).json({
                        success: false,
                        message: 'Image message must have content.url or content.data'
                    });
                }
                break;

            case 'location':
                if (!content || !content.coordinates) {
                    return res.status(400).json({
                        success: false,
                        message: 'Location message must have content.coordinates'
                    });
                }

                messageData.content = {
                    name: content.name || 'Location',
                    address: content.address || '',
                    coordinates: content.coordinates
                };
                break;

            case 'customLocation':
                if (!content || !content.coordinates || !content.icon) {
                    return res.status(400).json({
                        success: false,
                        message: 'Custom location message must have content.coordinates and content.icon'
                    });
                }

                messageData.content = {
                    name: content.name || 'Custom Location',
                    coordinates: content.coordinates,
                    icon: content.icon,
                    comment: content.comment || '',
                    images: content.images || [],
                    pinLocationId: content.pinLocationId || null
                };
                break;

            case 'video':
                if (!content || !content.url) {
                    return res.status(400).json({
                        success: false,
                        message: 'Video message must have content.url'
                    });
                }
                messageData.content = {
                    url: content.url,
                    mimeType: content.mimeType || 'video/mp4',
                    duration: content.duration || 5,
                    thumbnail: content.thumbnail || '',
                    name: content.name || 'video'
                };
                messageData.metadata = {
                    ...metadata,
                    size: content.size,
                    mimeType: content.mimeType || 'video/mp4',
                    duration: content.duration || 5,
                    thumbnail: content.thumbnail || ''
                };
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid message type'
                });
        }

        // Create and save message
        const message = new Message(messageData);
        await message.save();

        // Update chat's last activity and last message
        chat.lastActivity = new Date();
        chat.lastMessage = message._id;
        await chat.save();

        // Populate message data
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name username')
            .populate('replyTo')
            .lean();

        // Format the populated message to ensure proper data structure
        if (populatedMessage.type === 'image' && populatedMessage.content?.data) {
            // Convert Buffer to base64 string for images
            if (Buffer.isBuffer(populatedMessage.content.data)) {
                populatedMessage.content.data = populatedMessage.content.data.toString('base64');
            } else if (Array.isArray(populatedMessage.content.data)) {
                populatedMessage.content.data = Buffer.from(populatedMessage.content.data).toString('base64');
            }
            console.log('Image message formatted for socket - data length:', populatedMessage.content.data.length);
        } else if (populatedMessage.type === 'voice' && populatedMessage.content?.data) {
            // Convert Buffer to base64 string for voice messages
            if (Buffer.isBuffer(populatedMessage.content.data)) {
                populatedMessage.content.data = populatedMessage.content.data.toString('base64');
            } else if (Array.isArray(populatedMessage.content.data)) {
                populatedMessage.content.data = Buffer.from(populatedMessage.content.data).toString('base64');
            }
        }

        // Emit socket event
        const io = req.app.get('io');
        const socketData = {
            chatId: req.params.chatId,
            message: populatedMessage,
            connectionId: chat.metadata?.connectionId,
            chatType: chat.type
        };

        console.log('[SOCKET_DEBUG] Chat details for socket emission:', {
            chatId: req.params.chatId,
            chatType: chat.type,
            connectionId: chat.metadata?.connectionId,
            chatMetadata: chat.metadata
        });
        console.log('[SOCKET_DEBUG] Emitting socket event for message type:', populatedMessage.type);
        if (populatedMessage.type === 'image') {
            console.log('Socket image message data length:', populatedMessage.content?.data?.length);
        }
        const roomToEmit = `chat:${req.params.chatId}`;
        console.log('[SOCKET_DEBUG] Emitting to room:', roomToEmit);
        if (io) {
            console.log('[SOCKET_DEBUG] IO instance available:', !!io);
            console.log('[SOCKET_DEBUG] IO engine clients count:', io.engine?.clientsCount);
            console.log('[SOCKET_DEBUG] Room to emit to:', roomToEmit);
            io.to(roomToEmit).emit('newMessage', socketData);
            console.log('[SOCKET_DEBUG] Socket event emitted successfully');
        } else {
            console.log('[SOCKET_DEBUG] IO instance not available');
            console.log('[SOCKET_DEBUG] req.app.get("io") returned:', req.app.get('io'));
        }

        res.status(201).json({
            success: true,
            message: populatedMessage
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

// Mark messages as read
const markMessage = async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const userId = req.user.id;

        // Check if user is part of the chat
        const chat = await Chat.findOne({
            _id: chatId,
            'participants.userId': userId,
            'participants.status': 'active'
        });

        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Mark all unread messages in this chat as read
        await Message.updateMany(
            {
                chatId,
                sender: { $ne: userId },
                status: { $ne: 'read' }
            },
            {
                status: 'read'
            }
        );

        res.json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read',
            error: error.message
        });
    }
};

const getLastImageMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        console.log('[IMAGE_DEBUG] Fetching last image for chatId:', chatId);

        const lastImageMsg = await Message.findOne({ chatId, type: 'image' })
            .sort({ createdAt: -1 })
            .lean();

        console.log('[IMAGE_DEBUG] Found image message:', lastImageMsg ? {
            _id: lastImageMsg._id,
            type: lastImageMsg.type,
            createdAt: lastImageMsg.createdAt
        } : 'null');

        if (!lastImageMsg) {
            console.log('[IMAGE_DEBUG] No image message found');
            return res.json({ success: true, image: null });
        }

        let imageUrl = lastImageMsg.content.url;

        // Log the content structure to debug
        console.log('[IMAGE_DEBUG] Image content structure:', {
            hasUrl: !!lastImageMsg.content.url,
            hasData: !!lastImageMsg.content.data,
            urlLength: lastImageMsg.content.url ? lastImageMsg.content.url.length : 0,
            dataType: typeof lastImageMsg.content.data
        });

        // If we have a URL and it's not base64, use it
        if (imageUrl && imageUrl !== '' && !imageUrl.startsWith('data:')) {
            console.log('[IMAGE_DEBUG] Using existing URL, skipping base64 data');
        }
        // Only use base64 if no URL is available
        else if ((!imageUrl || imageUrl === '') && lastImageMsg.content.data) {
            console.log('[IMAGE_DEBUG] No URL found, using base64 data');
            const mimeType = lastImageMsg.content.mimeType || 'image/jpeg';
            // Properly convert BSON Binary to base64
            let base64;
            if (lastImageMsg.content.data.buffer) {
                // BSON Binary (from .lean())
                base64 = Buffer.from(lastImageMsg.content.data.buffer).toString('base64');
            } else if (Buffer.isBuffer(lastImageMsg.content.data)) {
                // Native Buffer (if not using .lean())
                base64 = lastImageMsg.content.data.toString('base64');
            } else if (typeof lastImageMsg.content.data === 'string') {
                // Already a base64 string
                base64 = lastImageMsg.content.data;
            } else {
                base64 = '';
            }
            // Check if base64 data is too large (more than 1MB)
            if (base64.length > 1024 * 1024) {
                console.log('[IMAGE_DEBUG] Base64 data too large, returning error');
                return res.status(413).json({
                    success: false,
                    message: 'Image data too large for API response',
                    error: 'Image exceeds maximum size for API response'
                });
            }

            imageUrl = `data:${mimeType};base64,${base64}`;
            console.log('[IMAGE_DEBUG] Created base64 URL, length:', imageUrl.length);
        } else {
            console.log('[IMAGE_DEBUG] Using URL:', imageUrl);
        }

        // Return image data similar to how videos are returned
        const imageData = {
            _id: lastImageMsg._id,
            type: 'image',
            chatId: lastImageMsg.chatId,
            sender: lastImageMsg.sender,
            createdAt: lastImageMsg.createdAt,
            content: {
                url: imageUrl,
                type: 'image',
                mimeType: lastImageMsg.content.mimeType || 'image/jpeg',
                width: lastImageMsg.content.width || 0,
                height: lastImageMsg.content.height || 0
            },
            metadata: lastImageMsg.metadata || {}
        };

        // If we have a URL and it's not base64, don't include data field
        if (imageUrl && !imageUrl.startsWith('data:')) {
            console.log('[IMAGE_DEBUG] Using URL-based response, excluding base64 data');
        } else {
            console.log('[IMAGE_DEBUG] Using base64 response');
        }

        // Log the final response size
        const responseSize = JSON.stringify(imageData).length;
        console.log('[IMAGE_DEBUG] Final response size:', responseSize, 'bytes');

        if (responseSize > 1024 * 1024) { // 1MB limit
            console.log('[IMAGE_DEBUG] Response too large, returning error');
            return res.status(413).json({
                success: false,
                message: 'Image response too large',
                error: 'Image data exceeds maximum response size'
            });
        }

        console.log('[IMAGE_DEBUG] Returning image data:', {
            _id: imageData._id,
            type: imageData.type,
            chatId: imageData.chatId,
            url: imageData.content.url
        });

        res.json({ success: true, image: imageData });
    } catch (error) {
        console.error('Error fetching last image:', error);
        res.status(500).json({ success: false, message: 'Error fetching last image', error: error.message });
    }
};

const getLastVideoMessage = async (req, res) => {
    try {
        const { chatId } = req.params;

        console.log('[VIDEO_DEBUG] Fetching last video for chatId:', chatId);

        const lastVideoMsg = await Message.findOne({ chatId, type: 'video' })
            .sort({ createdAt: -1 })
            .lean();

        console.log('[VIDEO_DEBUG] Found video message:', lastVideoMsg ? {
            _id: lastVideoMsg._id,
            type: lastVideoMsg.type,
            createdAt: lastVideoMsg.createdAt
        } : 'null');

        if (!lastVideoMsg) {
            console.log('[VIDEO_DEBUG] No video message found');
            return res.json({ success: true, video: null });
        }

        // Return video data similar to how images are returned
        const videoData = {
            _id: lastVideoMsg._id,
            type: 'video',
            chatId: lastVideoMsg.chatId,
            sender: lastVideoMsg.sender,
            createdAt: lastVideoMsg.createdAt,
            content: {
                url: lastVideoMsg.content.url,
                type: 'video',
                mimeType: lastVideoMsg.content.mimeType || 'video/mp4',
                thumbnail: lastVideoMsg.content.thumbnail || null,
                duration: lastVideoMsg.content.duration || lastVideoMsg.metadata?.duration || 5
            },
            metadata: lastVideoMsg.metadata || {}
        };

        console.log('[VIDEO_DEBUG] Returning video data:', {
            _id: videoData._id,
            type: videoData.type,
            url: videoData.content.url
        });

        res.json({ success: true, video: videoData });
    } catch (error) {
        console.error('Error fetching last video:', error);
        res.status(500).json({ success: false, message: 'Error fetching last video', error: error.message });
    }
};

const getLastVoiceMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const lastVoiceMsg = await Message.findOne({ chatId, type: 'voice' })
            .sort({ createdAt: -1 })
            .lean();
        if (!lastVoiceMsg) {
            console.log('[VOICE_DEBUG] No voice message found for chatId:', chatId);
            return res.json({ success: true, voice: null });
        }
        let voiceData = null;
        if (lastVoiceMsg.content.data) {
            const mimeType = lastVoiceMsg.content.mimeType || 'audio/m4a';
            let base64;

            // Convert binary data to base64
            if (Buffer.isBuffer(lastVoiceMsg.content.data)) {
                base64 = lastVoiceMsg.content.data.toString('base64');
            } else if (lastVoiceMsg.content.data.buffer) {
                base64 = Buffer.from(lastVoiceMsg.content.data.buffer).toString('base64');
            } else if (typeof lastVoiceMsg.content.data === 'string') {
                base64 = lastVoiceMsg.content.data;
            } else {
                console.log('[VOICE_DEBUG] Unknown voice data format:', typeof lastVoiceMsg.content.data);
                base64 = '';
            }

            if (base64) {
                voiceData = {
                    _id: lastVoiceMsg._id,
                    url: `data:${mimeType};base64,${base64}`,
                    mimeType,
                    duration: lastVoiceMsg.content.duration || lastVoiceMsg.metadata?.duration || null,
                    sender: lastVoiceMsg.sender,
                    createdAt: lastVoiceMsg.createdAt,
                    chatId: lastVoiceMsg.chatId
                };

                console.log('[VOICE_DEBUG] Voice data prepared successfully:', {
                    voiceId: voiceData._id,
                    hasUrl: !!voiceData.url,
                    duration: voiceData.duration,
                    mimeType: voiceData.mimeType
                });
            }
        } else {
            console.log('[VOICE_DEBUG] lastVoiceMsg found but no content.data for chatId:', chatId);
        }

        res.json({ success: true, voice: voiceData });
    } catch (error) {
        console.error('[VOICE_DEBUG] Error in getLastVoiceMessage:', error);
        res.status(500).json({ success: false, message: 'Error fetching last voice', error: error.message });
    }
};

const getAllVoiceMessagesForChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const voiceMessages = await Message.find({ chatId, type: 'voice' })
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, count: voiceMessages.length, messages: voiceMessages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching voice messages', error: error.message });
    }
};

module.exports = {
    getAllChats,
    getPersonalChat,
    existingChat,
    newMessage,
    markMessage,
    getGroupChat,
    getSingleChat,
    newChat,
    chatMessages,
    getLastImageMessage,
    getLastVideoMessage,
    getLastVoiceMessage,
    getAllVoiceMessagesForChat
}; 