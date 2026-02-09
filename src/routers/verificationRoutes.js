const express = require('express');
const router = express.Router();
const { verifyCode, sendVerificationCode } = require('../controllers/verificationController');
const { protect } = require('../middleweres/protect');

/**
 * Send verification code for Google users
 * POST /api/verification/send-code
 * Body: { purpose: 'account_deletion' | 'ownership_transfer' }
 */
router.post('/send-code', protect, sendVerificationCode);

/**
 * Verify code for Google users
 * POST /api/verification/verify-code
 * Body: { code: '123456', purpose: 'account_deletion' | 'ownership_transfer' }
 */
router.post('/verify-code', protect, verifyCode);

module.exports = router;
