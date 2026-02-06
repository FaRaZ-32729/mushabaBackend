const PersonalPinLocation = require('../models/personalPinLocationSchema');
const Chat = require('../models/chatSchema');
const Message = require('../models/messageSchema');
const fs = require('fs').promises;
const path = require('path');

// Helper function to create uploads directory
const createUploadsDirectory = async () => {
    const uploadsDir = path.join(__dirname, '../uploads/personal-pin-locations');
    try {
        await fs.access(uploadsDir);
    } catch (error) {
        await fs.mkdir(uploadsDir, { recursive: true });
    }
};

// Create a new personal pin location
const createPersonalPinLocation = async (req, res) => {
    console.warn('[PERSONAL_PIN_DEBUG] createPersonalPinLocation called');
    try {
        await createUploadsDirectory();

        const {
            chatId,
            type,
            name,
            latitude,
            longitude,
            comment,
            icon
        } = req.body;

        const userId = req.user.id;

        // Debug logging
        console.log('[CREATE_PERSONAL_PIN_LOCATION] Request received:', {
            chatId,
            type,
            name,
            latitude,
            longitude,
            comment,
            icon,
            userId,
            filesCount: req.files?.length || 0
        });

        // Validate required fields (NO connectionId needed)
        if (!chatId || !type || !name || !latitude || !longitude || !icon) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate images upload (only one image allowed)
        if (req.files && req.files.length > 1) {
            return res.status(400).json({
                success: false,
                message: 'Only 1 image allowed for personal pin locations'
            });
        }

        // Validate coordinates
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates'
            });
        }

        // Check if chat exists and user has access
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        const userInChat = chat.participants.find(
            participant => participant.userId.toString() === userId
        );

        if (!userInChat) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - user not in chat'
            });
        }

        // Create personal pin location object
        const personalPinLocationData = {
            userId,
            chatId,
            type,
            name,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            comment: comment || '',
            images: req.files ? req.files.map(file => `/uploads/personal-pin-locations/${file.filename}`) : [],
            icon,
            markedAt: new Date()
        };

        // Save personal pin location
        const personalPinLocation = new PersonalPinLocation(personalPinLocationData);
        await personalPinLocation.save();

        // Create chat message for the personal pin location
        const messageData = {
            chatId,
            sender: userId,
            type: 'personalLocation',
            content: {
                name,
                coordinates: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
                icon,
                comment: comment || '',
                images: req.files ? req.files.map(file => `/uploads/personal-pin-locations/${file.filename}`) : [],
                personalPinLocationId: personalPinLocation._id
            },
            metadata: {
                personalPinLocationId: personalPinLocation._id,
                locationType: type
            }
        };

        const message = new Message(messageData);
        await message.save();

        // Update chat's last activity
        chat.lastActivity = new Date();
        chat.lastMessage = message._id;
        await chat.save();

        // Populate message for response
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name username profilePicture')
            .lean();

        // No WebSocket emission needed for personal chat - only current user sees it

        res.json({
            success: true,
            message: 'Personal pin location created successfully',
            personalPinLocationId: personalPinLocation._id,
            imageUrls: req.files ? req.files.map(file => `/uploads/personal-pin-locations/${file.filename}`) : [],
            personalPinLocation: {
                ...personalPinLocation.toObject(),
                imageUrls: req.files ? req.files.map(file => `/uploads/personal-pin-locations/${file.filename}`) : []
            },
            chatMessage: populatedMessage
        });

    } catch (error) {
        console.error('[CREATE_PERSONAL_PIN_LOCATION] Error:', error);

        // Clean up uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            try {
                await Promise.all(req.files.map(file => fs.unlink(file.path)));
            } catch (unlinkError) {
                console.error('[CREATE_PERSONAL_PIN_LOCATION] Error deleting files:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create personal pin location',
            error: error.message
        });
    }
};

// Get user's personal pin locations
const getPersonalPinLocations = async (req, res) => {
    try {
        const userId = req.user.id;

        const personalPinLocations = await PersonalPinLocation.getUserPersonalPins(userId);

        // Add full image URLs
        const personalPinLocationsWithUrls = personalPinLocations.map(pin => ({
            ...pin.toObject(),
            images: pin.images.map(img => img.startsWith('/uploads/personal-pin-locations/') ? img : `/uploads/personal-pin-locations/${img}`)
        }));

        res.json({
            success: true,
            personalPinLocations: personalPinLocationsWithUrls,
            count: personalPinLocationsWithUrls.length
        });

    } catch (error) {
        console.error('[GET_PERSONAL_PIN_LOCATIONS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch personal pin locations'
        });
    }
};

// Get user's personal pin locations for specific chat
const getPersonalPinLocationsForChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.id;

        // Check if user has access to this chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        const userInChat = chat.participants.find(
            participant => participant.userId.toString() === userId
        );

        if (!userInChat) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - user not in chat'
            });
        }

        const personalPinLocations = await PersonalPinLocation.getUserPersonalPinsForChat(userId, chatId);

        // Add full image URLs
        const personalPinLocationsWithUrls = personalPinLocations.map(pin => ({
            ...pin.toObject(),
            images: pin.images.map(img => img.startsWith('/uploads/personal-pin-locations/') ? img : `/uploads/personal-pin-locations/${img}`)
        }));

        res.json({
            success: true,
            personalPinLocations: personalPinLocationsWithUrls,
            count: personalPinLocationsWithUrls.length
        });

    } catch (error) {
        console.error('[GET_PERSONAL_PIN_LOCATIONS_FOR_CHAT] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch personal pin locations for chat'
        });
    }
};

// Get a specific personal pin location
const getPersonalPinLocation = async (req, res) => {
    try {
        const { pinId } = req.params;
        const userId = req.user.id;

        const personalPinLocation = await PersonalPinLocation.findById(pinId)
            .populate('userId', 'name username profilePicture');

        if (!personalPinLocation) {
            return res.status(404).json({
                success: false,
                message: 'Personal pin location not found'
            });
        }

        // Check ownership
        if (personalPinLocation.userId._id.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Add full image URLs
        const personalPinLocationWithUrls = {
            ...personalPinLocation.toObject(),
            images: personalPinLocation.images.map(img => img.startsWith('/uploads/personal-pin-locations/') ? img : `/uploads/personal-pin-locations/${img}`)
        };

        res.json({
            success: true,
            personalPinLocation: personalPinLocationWithUrls
        });

    } catch (error) {
        console.error('[GET_PERSONAL_PIN_LOCATION] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch personal pin location'
        });
    }
};

// Update a personal pin location
const updatePersonalPinLocation = async (req, res) => {
    try {
        const { pinId } = req.params;
        const {
            type,
            name,
            latitude,
            longitude,
            comment,
            icon
        } = req.body;

        const userId = req.user.id;

        console.log('[UPDATE_PERSONAL_PIN_LOCATION] Request received:', {
            pinId,
            updates: req.body,
            userId,
            filesCount: req.files?.length || 0
        });

        // Find personal pin location
        const personalPinLocation = await PersonalPinLocation.findById(pinId);
        if (!personalPinLocation) {
            return res.status(404).json({
                success: false,
                message: 'Personal pin location not found'
            });
        }

        // Check ownership
        if (personalPinLocation.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - only creator can update'
            });
        }

        // Prepare update object
        const updateData = {};
        if (type) updateData.type = type;
        if (name) updateData.name = name;
        if (latitude !== undefined) {
            if (latitude < -90 || latitude > 90) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid latitude'
                });
            }
            updateData.latitude = parseFloat(latitude);
        }
        if (longitude !== undefined) {
            if (longitude < -180 || longitude > 180) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid longitude'
                });
            }
            updateData.longitude = parseFloat(longitude);
        }
        if (comment !== undefined) updateData.comment = comment;
        if (icon) updateData.icon = icon;

        // Handle image updates - intelligent image management
        try {
            console.log('[UPDATE_PERSONAL_PIN_LOCATION] Files received:', req.files ? req.files.length : 0);
            console.log('[UPDATE_PERSONAL_PIN_LOCATION] Current images:', personalPinLocation.images);

            // Check if user wants to clear all images
            const shouldClearImages = req.body.images === '[]' || req.body.images === '';

            // Check if user wants to keep specific existing images
            const keepExistingImages = req.body.keepExistingImages;

            if (req.files && req.files.length > 0) {
                // User is adding new images
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Adding new images');

                // Determine which existing images to keep
                let imagesToKeep = [];
                if (keepExistingImages && Array.isArray(keepExistingImages)) {
                    imagesToKeep = keepExistingImages;
                    console.log('[UPDATE_PERSONAL_PIN_LOCATION] Keeping existing images:', imagesToKeep);
                }

                // Delete only the images that are NOT being kept
                const imagesToDelete = personalPinLocation.images.filter(img => !imagesToKeep.includes(img));
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Images to delete:', imagesToDelete);

                try {
                    if (imagesToDelete.length > 0) {
                        await Promise.all(imagesToDelete.map(async (oldImage) => {
                            try {
                                const filename = oldImage.replace('/uploads/personal-pin-locations/', '');
                                const oldImagePath = path.join(__dirname, '..', 'uploads', 'personal-pin-locations', filename);
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Deleting file:', oldImagePath);
                                await fs.unlink(oldImagePath);
                            } catch (fileError) {
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old image:', fileError.message);
                            }
                        }));
                    }
                } catch (error) {
                    console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old images:', error.message);
                }

                // Combine kept existing images with new images
                const newImagePaths = req.files.map(file => `/uploads/personal-pin-locations/${file.filename}`);
                updateData.images = [...imagesToKeep, ...newImagePaths];
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Final images:', updateData.images);

            } else if (shouldClearImages) {
                // User wants to clear all images
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Clearing all images as requested');

                // Delete all old images
                try {
                    if (personalPinLocation.images && personalPinLocation.images.length > 0) {
                        await Promise.all(personalPinLocation.images.map(async (oldImage) => {
                            try {
                                const filename = oldImage.replace('/uploads/personal-pin-locations/', '');
                                const oldImagePath = path.join(__dirname, '..', 'uploads', 'personal-pin-locations', filename);
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Deleting file:', oldImagePath);
                                await fs.unlink(oldImagePath);
                            } catch (fileError) {
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old image:', fileError.message);
                            }
                        }));
                    }
                } catch (error) {
                    console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old images:', error.message);
                }

                // Set images to empty array
                updateData.images = [];
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Images cleared');

            } else if (keepExistingImages && Array.isArray(keepExistingImages)) {
                // User wants to keep only specific existing images (no new images)
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Keeping only specified existing images:', keepExistingImages);

                // Delete images that are NOT being kept
                const imagesToDelete = personalPinLocation.images.filter(img => !keepExistingImages.includes(img));
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Images to delete:', imagesToDelete);

                try {
                    if (imagesToDelete.length > 0) {
                        await Promise.all(imagesToDelete.map(async (oldImage) => {
                            try {
                                const filename = oldImage.replace('/uploads/personal-pin-locations/', '');
                                const oldImagePath = path.join(__dirname, '..', 'uploads', 'personal-pin-locations', filename);
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Deleting file:', oldImagePath);
                                await fs.unlink(oldImagePath);
                            } catch (fileError) {
                                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old image:', fileError.message);
                            }
                        }));
                    }
                } catch (error) {
                    console.log('[UPDATE_PERSONAL_PIN_LOCATION] Could not delete old images:', error.message);
                }

                // Keep only the specified existing images
                updateData.images = keepExistingImages;
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] Images updated to:', updateData.images);

            } else {
                // No changes to images - keep existing ones
                console.log('[UPDATE_PERSONAL_PIN_LOCATION] No image changes, keeping existing:', personalPinLocation.images);
                // Don't update images field - keep existing ones
            }
        } catch (imageError) {
            console.error('[UPDATE_PERSONAL_PIN_LOCATION] Error in image handling:', imageError);
            // Continue with the update even if image handling fails
        }

        // Update timestamp
        updateData.updatedAt = new Date();

        // Update personal pin location
        const updatedPersonalPinLocation = await PersonalPinLocation.findByIdAndUpdate(
            pinId,
            updateData,
            { new: true, runValidators: true }
        ).populate('userId', 'name username profilePicture');

        // Update corresponding chat message if content changed
        if (comment || icon || name || latitude !== undefined || longitude !== undefined) {
            const message = await Message.findOne({
                'metadata.personalPinLocationId': pinId,
                type: 'personalLocation'
            });

            if (message) {
                const messageUpdates = {};
                if (comment) messageUpdates['content.comment'] = comment;
                if (icon) messageUpdates['content.icon'] = icon;
                if (name) messageUpdates['content.name'] = name;
                if (latitude !== undefined || longitude !== undefined) {
                    messageUpdates['content.coordinates'] = {
                        latitude: updatedPersonalPinLocation.latitude,
                        longitude: updatedPersonalPinLocation.longitude
                    };
                }

                await Message.findByIdAndUpdate(message._id, messageUpdates);
            }
        }

        res.json({
            success: true,
            message: 'Personal pin location updated successfully',
            personalPinLocation: {
                ...updatedPersonalPinLocation.toObject(),
                images: updatedPersonalPinLocation.images.map(img => img.startsWith('/uploads/personal-pin-locations/') ? img : `/uploads/personal-pin-locations/${img}`)
            }
        });

    } catch (error) {
        console.error('[UPDATE_PERSONAL_PIN_LOCATION] Error:', error);

        // Clean up uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            try {
                await Promise.all(req.files.map(file => fs.unlink(file.path)));
            } catch (unlinkError) {
                console.error('[UPDATE_PERSONAL_PIN_LOCATION] Error deleting files:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update personal pin location',
            error: error.message
        });
    }
};

// Delete a personal pin location
const deletePersonalPinLocation = async (req, res) => {
    try {
        const { pinId } = req.params;
        const userId = req.user.id;

        console.log('[DELETE_PERSONAL_PIN_LOCATION] Request received:', { pinId, userId });

        // Find personal pin location
        const personalPinLocation = await PersonalPinLocation.findById(pinId);
        if (!personalPinLocation) {
            return res.status(404).json({
                success: false,
                message: 'Personal pin location not found'
            });
        }

        // Check ownership
        if (personalPinLocation.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - only creator can delete'
            });
        }

        // Delete associated images
        try {
            await Promise.all(personalPinLocation.images.map(async (image) => {
                const imagePath = path.join(__dirname, '../uploads/personal-pin-locations', image);
                await fs.unlink(imagePath);
            }));
        } catch (unlinkError) {
            console.error('[DELETE_PERSONAL_PIN_LOCATION] Error deleting images:', unlinkError);
        }

        // Delete associated chat message
        try {
            await Message.deleteMany({
                'metadata.personalPinLocationId': pinId,
                type: 'personalLocation'
            });
        } catch (messageError) {
            console.error('[DELETE_PERSONAL_PIN_LOCATION] Error deleting message:', messageError);
        }

        // Delete personal pin location
        await PersonalPinLocation.findByIdAndDelete(pinId);

        res.json({
            success: true,
            message: 'Personal pin location deleted successfully'
        });

    } catch (error) {
        console.error('[DELETE_PERSONAL_PIN_LOCATION] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete personal pin location',
            error: error.message
        });
    }
};

module.exports = {
    createPersonalPinLocation,
    getPersonalPinLocations,
    getPersonalPinLocationsForChat,
    getPersonalPinLocation,
    updatePersonalPinLocation,
    deletePersonalPinLocation
};
