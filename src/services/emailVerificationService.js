const nodemailer = require('nodemailer');

/**
 * Email Verification Service for Google Users
 * Handles verification codes for sensitive operations like account deletion and ownership transfer
 */
class EmailVerificationService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    /**
     * Initialize email transporter
     */
    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        } catch (error) {
            console.error('Failed to initialize email transporter:', error);
        }
    }

    /**
     * Generate 6-digit verification code
     */
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Send verification code email
     * @param {string} email - User's email
     * @param {string} code - Verification code
     * @param {string} purpose - Purpose of verification (account_deletion, ownership_transfer)
     */
    async sendVerificationCode(email, code, purpose) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const subject = this.getEmailSubject(purpose);
            const text = this.getEmailText(code, purpose);
            const html = this.getEmailHtml(code, purpose);

            await this.transporter.sendMail({
                from: process.env.MAIL_FROM || 'no-reply@mushaba.com',
                to: email,
                subject: subject,
                text: text,
                html: html
            });

            console.log(`Verification code sent to ${email} for ${purpose}`);
            return true;
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw error;
        }
    }

    /**
     * Get email subject based on purpose
     */
    getEmailSubject(purpose) {
        switch (purpose) {
            case 'account_deletion':
                return 'Account Deletion Verification Code';
            case 'ownership_transfer':
                return 'Ownership Transfer Verification Code';
            default:
                return 'Verification Code';
        }
    }

    /**
     * Get email text content
     */
    getEmailText(code, purpose) {
        const purposeText = this.getPurposeText(purpose);
        return `Your verification code for ${purposeText} is ${code}. This code expires in 10 minutes. Please do not share this code with anyone.`;
    }

    /**
     * Get email HTML content
     */
    getEmailHtml(code, purpose) {
        const purposeText = this.getPurposeText(purpose);
        return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verification Code</h2>
        <p>Your verification code for <strong>${purposeText}</strong> is:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #666; font-size: 14px;">Please do not share this code with anyone. If you did not request this verification, please ignore this email.</p>
      </div>
    `;
    }

    /**
     * Get human-readable purpose text
     */
    getPurposeText(purpose) {
        switch (purpose) {
            case 'account_deletion':
                return 'account deletion';
            case 'ownership_transfer':
                return 'ownership transfer';
            default:
                return 'verification';
        }
    }

    /**
     * Verify if code matches and is not expired
     * @param {string} storedCode - Code stored in database
     * @param {string} providedCode - Code provided by user
     * @param {Date} expiresAt - Expiration date
     */
    verifyCode(storedCode, providedCode, expiresAt) {
        if (!storedCode || !providedCode || !expiresAt) {
            return false;
        }

        if (storedCode !== providedCode) {
            return false;
        }

        if (new Date() > new Date(expiresAt)) {
            return false;
        }

        return true;
    }
}

// Export singleton instance
module.exports = new EmailVerificationService();
