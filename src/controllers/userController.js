const bcrypt = require("bcryptjs");
const QRCode = require('qrcode');
const Connection = require('../models/connectionSchema');
const { createNotification } = require('./notificationController');
const User = require("../models/userSchema");

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ name: 1 });

        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users'
        });
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user'
        });
    }
};

// Update user profile
const updateProfile = async (req, res) => {
    try {
        const { name, username, oldPassword, newPassword, image, phone, nationality } = req.body;
        const userId = req.user.id;

        // Find user with password field explicitly selected
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // If updating password
        if (oldPassword && newPassword) {
            // Verify old password
            const isMatch = await user.comparePassword(oldPassword);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Set new password and mark it as modified
            user.password = newPassword;
            user.markModified('password');
        }

        // Update other fields
        if (name) {
            if (!name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Name cannot be empty'
                });
            }
            user.name = name.trim();
        }

        if (username) {
            if (!username.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Username cannot be empty'
                });
            }

            // Check if username is already taken by another user
            const existingUser = await User.findOne({
                username: username.trim(),
                _id: { $ne: userId }
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already taken'
                });
            }

            user.username = username.trim();
        }

        if (image) {
            user.image = image;
        }

        if (phone !== undefined) {
            user.phone = phone;
        }

        if (nationality) {
            if (!nationality.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Nationality cannot be empty'
                });
            }
            user.nationality = nationality.trim();
        }

        // Save updated user
        await user.save();

        // Return updated user without password
        const updatedUser = await User.findById(userId).select('-password');
        res.json({
            success: true,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
};

// Update user status
const updateUserStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { status },
            { new: true }
        ).select('-password');

        // Emit socket event for status update
        const io = req.app.get('io');
        io.emit('userStatus', {
            userId: user._id,
            status
        });

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status'
        });
    }
};

// Delete user account
const deleteUser = async (req, res) => {
    try {
        console.log('DELETE USER REQUEST BODY:', req.body);
        const userId = req.user.id;
        const { password, verificationCode } = req.body;
        const user = await User.findById(userId).select('+password');
        if (!user) {
            console.error('User not found for deletion:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if user is Google user
        if (user.isGoogleUser) {
            // Google user - verify email code
            if (!verificationCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is required for Google users'
                });
            }

            // Import email verification service
            const emailVerificationService = require('../services/emailVerificationService');

            const isValidCode = emailVerificationService.verifyCode(
                user.verificationCode,
                verificationCode,
                user.verificationCodeExpires
            );

            if (!isValidCode) {
                console.error('Invalid verification code for Google user:', userId);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired verification code'
                });
            }

            // Check if verification code purpose matches
            if (user.verificationCodePurpose !== 'account_deletion') {
                return res.status(401).json({
                    success: false,
                    message: 'Verification code purpose mismatch'
                });
            }

            console.log('Google user verification successful for deletion:', userId);
        } else {
            // Regular user - verify password
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message: 'Password is required for regular users'
                });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                console.error('Password incorrect for user:', userId);
                return res.status(401).json({ success: false, message: 'Password is incorrect' });
            }
        }
        // Check if user is owner of any connection
        const ownerConnections = await Connection.find({ 'users.userId': userId, 'users.role': 'owner' });
        if (ownerConnections.length > 0) {
            console.error('User is owner of connections:', ownerConnections.map(c => c._id));
            return res.status(400).json({ success: false, message: 'You are the owner of one or more connections. Please transfer ownership before deleting your account.' });
        }
        // Remove user from all connections
        const connections = await Connection.find({ 'users.userId': userId });
        for (const connection of connections) {
            connection.users = connection.users.filter(u => u.userId.toString() !== userId);
            if (connection.users.length === 0) {
                await connection.deleteOne();
            } else {
                await connection.save();
                for (const member of connection.users) {
                    await createNotification(
                        member.userId,
                        'user_removed',
                        `${user.name} deleted their account and was removed from the connection`,
                        { connectionId: connection._id, removedUserId: userId, type: 'warning' }
                    );
                }
            }
        }
        await user.deleteOne();
        console.log('User deleted successfully:', userId);
        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting account', error: error.message });
    }
};

// Check and fix user status for socket connection
const checkUserStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // If user doesn't have status field, add it
        if (!user.status) {
            user.status = 'active';
            user.lastSeen = new Date();
            await user.save();
            console.log(`[USER_STATUS] Added status field to user ${userId}`);
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                name: user.name,
                status: user.status,
                lastSeen: user.lastSeen
            }
        });
    } catch (error) {
        console.error('Error checking user status:', error);
        res.status(500).json({ success: false, message: 'Error checking user status' });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    updateUserStatus,
    updateProfile,
    deleteUser,
    checkUserStatus
}