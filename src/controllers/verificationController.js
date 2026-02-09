const User = require('../models/userSchema');
const emailVerificationService = require('../services/emailVerificationService');

/**
 * Send verification code for Google users
 * POST /api/verification/send-code
 * Body: { purpose: 'account_deletion' | 'ownership_transfer' }
 */
const sendVerificationCode = async (req, res) => {
    try {
        const { purpose } = req.body;
        const userId = req.user.id;

        // Validate purpose
        if (!purpose || !['account_deletion', 'ownership_transfer'].includes(purpose)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid purpose. Must be account_deletion or ownership_transfer'
            });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is Google user
        if (!user.isGoogleUser) {
            return res.status(400).json({
                success: false,
                message: 'This endpoint is only for Google users'
            });
        }

        // Check if user has email
        if (!user.email) {
            return res.status(400).json({
                success: false,
                message: 'User email not found'
            });
        }

        // Generate verification code
        const verificationCode = emailVerificationService.generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save verification code to user
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = expiresAt;
        user.verificationCodePurpose = purpose;
        await user.save();

        // Send email
        try {
            await emailVerificationService.sendVerificationCode(
                user.email,
                verificationCode,
                purpose
            );

            res.json({
                success: true,
                message: 'Verification code sent to your email'
            });
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError);

            // Clear the verification code if email failed
            user.verificationCode = null;
            user.verificationCodeExpires = null;
            user.verificationCodePurpose = null;
            await user.save();

            res.status(500).json({
                success: false,
                message: 'Failed to send verification email. Please try again.'
            });
        }

    } catch (error) {
        console.error('Error sending verification code:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending verification code'
        });
    }
};

/**
 * Verify code for Google users
 * POST /api/verification/verify-code
 * Body: { code: '123456', purpose: 'account_deletion' | 'ownership_transfer' }
 */
const verifyCode = async (req, res) => {
    try {
        const { code, purpose } = req.body;
        const userId = req.user.id;

        // Validate inputs
        if (!code || !purpose) {
            return res.status(400).json({
                success: false,
                message: 'Code and purpose are required'
            });
        }

        if (!['account_deletion', 'ownership_transfer'].includes(purpose)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid purpose'
            });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is Google user
        if (!user.isGoogleUser) {
            return res.status(400).json({
                success: false,
                message: 'This endpoint is only for Google users'
            });
        }

        // Verify code
        const isValid = emailVerificationService.verifyCode(
            user.verificationCode,
            code,
            user.verificationCodeExpires
        );

        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired verification code'
            });
        }

        // Check if purpose matches
        if (user.verificationCodePurpose !== purpose) {
            return res.status(401).json({
                success: false,
                message: 'Verification code purpose mismatch'
            });
        }

        // Clear verification code after successful verification
        user.verificationCode = null;
        user.verificationCodeExpires = null;
        user.verificationCodePurpose = null;
        await user.save();

        res.json({
            success: true,
            message: 'Verification code is valid'
        });

    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying code'
        });
    }
};

module.exports = { sendVerificationCode, verifyCode };
