const nodemailer = require('nodemailer');
const { User } = require('../models/index');
const logger = require('../config/logger');

class NotificationService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.initializeTransporter();
    }

    /**
     * Initialize the email transporter
     */
    initializeTransporter() {
        try {
            const smtpConfig = {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD,
                },
            };

            // Check if SMTP is configured
            if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
                logger.warn('SMTP not configured, notifications will be logged only');
                this.isConfigured = false;
                return;
            }

            this.transporter = nodemailer.createTransport(smtpConfig);
            this.isConfigured = true;

            logger.info('Email transporter initialized', {
                host: smtpConfig.host,
                port: smtpConfig.port,
                user: smtpConfig.auth.user,
            });

        } catch (error) {
            logger.error('Error initializing email transporter', {
                error: error.message,
            });
            this.isConfigured = false;
        }
    }

    /**
     * Send job failure notification
     * @param {Object} notificationData - Notification data
     */
    async sendJobFailureNotification(notificationData) {
        const { jobId, jobName, userId, error, attempts, timestamp } = notificationData;

        try {
            // Get user details
            const user = await User.findById(userId);

            if (!user) {
                logger.error('User not found for notification', { userId, jobId });
                return;
            }

            const emailSubject = `Job Failed: ${jobName}`;
            const emailBody = this.generateFailureEmailBody({
                jobId,
                jobName,
                error,
                attempts,
                timestamp,
                userEmail: user.email,
            });

            // Send email or log
            if (this.isConfigured) {
                await this.sendEmail({
                    to: user.email,
                    subject: emailSubject,
                    html: emailBody,
                });

                logger.info('Job failure notification sent', {
                    jobId,
                    userId,
                    email: user.email,
                });
            } else {
                logger.info('Job failure notification (SMTP not configured)', {
                    jobId,
                    userId,
                    email: user.email,
                    subject: emailSubject,
                });
            }

        } catch (error) {
            logger.error('Error sending job failure notification', {
                jobId,
                userId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Send email using nodemailer
     * @param {Object} emailData - Email data
     */
    async sendEmail({ to, subject, html }) {
        try {
            const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to,
                subject,
                html,
            };

            const info = await this.transporter.sendMail(mailOptions);

            logger.info('Email sent successfully', {
                to,
                subject,
                messageId: info.messageId,
            });

            return info;

        } catch (error) {
            logger.error('Error sending email', {
                to,
                subject,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Generate HTML email body for job failure
     * @param {Object} data - Email data
     * @returns {string} HTML email body
     */
    generateFailureEmailBody(data) {
        const { jobId, jobName, error, attempts, timestamp, userEmail } = data;

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc3545; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #495057; }
        .value { color: #212529; }
        .error-box { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 0.9em; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>⚠️ Job Execution Failed</h2>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>Your scheduled job has failed after multiple retry attempts.</p>
            
            <div class="detail">
                <span class="label">Job Name:</span>
                <span class="value">${jobName}</span>
            </div>
            
            <div class="detail">
                <span class="label">Job ID:</span>
                <span class="value">${jobId}</span>
            </div>
            
            <div class="detail">
                <span class="label">Failed At:</span>
                <span class="value">${new Date(timestamp).toLocaleString()}</span>
            </div>
            
            <div class="detail">
                <span class="label">Retry Attempts:</span>
                <span class="value">${attempts}</span>
            </div>
            
            <div class="error-box">
                <div class="label">Error Message:</div>
                <div class="value">${error}</div>
            </div>
            
            <p>Please review your job configuration and check the execution logs for more details.</p>
            
            <div class="footer">
                <p>This is an automated notification from Chronos Job Scheduler.</p>
                <p>If you have questions, please contact support.</p>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();
    }

    /**
     * Verify SMTP connection
     * @returns {Promise<boolean>}
     */
    async verifyConnection() {
        if (!this.isConfigured) {
            logger.warn('SMTP not configured, cannot verify connection');
            return false;
        }

        try {
            await this.transporter.verify();
            logger.info('SMTP connection verified');
            return true;
        } catch (error) {
            logger.error('SMTP connection verification failed', {
                error: error.message,
            });
            return false;
        }
    }

    /**
     * Get notification service status
     */
    getStatus() {
        return {
            isConfigured: this.isConfigured,
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
        };
    }
}

// Export singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;