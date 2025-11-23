const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../config/redis');
const { QUEUE_NAMES } = require('../config/queue');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

// Worker configuration
const NOTIFICATION_WORKER_CONCURRENCY = parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY || '3');
const WORKER_NAME = process.env.NOTIFICATION_WORKER_NAME || `notification-worker-${process.pid}`;

/**
 * Notification Worker
 * Processes notification jobs from the notification-queue
 * Sends email notifications for job failures and other events
 */
class NotificationWorker {
    constructor() {
        this.worker = null;
        this.connection = null;
        this.isRunning = false;
    }

    /**
     * Start the notification worker
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Notification worker is already running');
            return;
        }

        try {
            logger.info('Starting notification worker', {
                workerName: WORKER_NAME,
                concurrency: NOTIFICATION_WORKER_CONCURRENCY,
                queue: QUEUE_NAMES.NOTIFICATIONS,
            });

            // Create BullMQ connection with proper config
            this.connection = createBullMQConnection();
            // BullMQ requires maxRetriesPerRequest to be null
            this.connection.options.maxRetriesPerRequest = null;

            // Create worker
            this.worker = new Worker(
                QUEUE_NAMES.NOTIFICATIONS,
                async (job) => {
                    return await this.processNotification(job);
                },
                {
                    connection: this.connection,
                    concurrency: NOTIFICATION_WORKER_CONCURRENCY,
                    limiter: {
                        max: 50, // Process max 50 notifications
                        duration: 60000, // Per 60 seconds (1 minute)
                    },
                    lockDuration: 10000, // 10 seconds lock (notifications should be fast)
                    stalledInterval: 30000,
                }
            );

            // Set up event listeners
            this.setupEventListeners();

            this.isRunning = true;
            logger.info('Notification worker started successfully', {
                workerName: WORKER_NAME,
                concurrency: NOTIFICATION_WORKER_CONCURRENCY,
            });

        } catch (error) {
            logger.error('Error starting notification worker', {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    }

    /**
     * Process a notification job
     * @param {Object} job - Bull job instance
     * @returns {Promise<Object>} Notification result
     */
    async processNotification(job) {
        const startTime = Date.now();
        const { type, ...data } = job.data;

        logger.info('Processing notification', {
            bullJobId: job.id,
            type,
            jobId: data.jobId,
            attempt: job.attemptsMade + 1,
        });

        try {
            let result;

            // Handle different notification types
            switch (type) {
                case 'job_failure':
                    result = await this.handleJobFailureNotification(data);
                    break;

                case 'job_success':
                    result = await this.handleJobSuccessNotification(data);
                    break;

                default:
                    logger.warn('Unknown notification type', { type });
                    result = { success: false, reason: 'Unknown notification type' };
            }

            const duration = Date.now() - startTime;

            logger.info('Notification processed successfully', {
                bullJobId: job.id,
                type,
                duration,
                success: result.success,
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Notification processing failed', {
                bullJobId: job.id,
                type,
                attempt: job.attemptsMade + 1,
                error: error.message,
                duration,
            });

            // Re-throw error to trigger Bull's retry mechanism
            throw error;
        }
    }

    /**
     * Handle job failure notification
     * @param {Object} data - Notification data
     * @returns {Promise<Object>} Result
     */
    async handleJobFailureNotification(data) {
        try {
            await notificationService.sendJobFailureNotification(data);

            return {
                success: true,
                type: 'job_failure',
                jobId: data.jobId,
                sentAt: new Date(),
            };

        } catch (error) {
            logger.error('Error sending job failure notification', {
                jobId: data.jobId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Handle job success notification (optional feature)
     * @param {Object} data - Notification data
     * @returns {Promise<Object>} Result
     */
    async handleJobSuccessNotification(data) {
        // This is an optional feature for future enhancement
        logger.info('Job success notification', {
            jobId: data.jobId,
            jobName: data.jobName,
        });

        return {
            success: true,
            type: 'job_success',
            jobId: data.jobId,
            message: 'Success notifications not yet implemented',
        };
    }

    /**
     * Set up event listeners for the worker
     */
    setupEventListeners() {
        // Notification sent successfully
        this.worker.on('completed', (job, result) => {
            logger.info('Notification sent', {
                bullJobId: job.id,
                type: job.data.type,
                jobId: job.data.jobId,
            });
        });

        // Notification failed
        this.worker.on('failed', (job, error) => {
            const isLastAttempt = job.attemptsMade >= job.opts.attempts;

            logger.error('Notification failed', {
                bullJobId: job.id,
                type: job.data.type,
                jobId: job.data.jobId,
                attempt: job.attemptsMade,
                maxRetries: job.opts.attempts,
                isLastAttempt,
                error: error.message,
            });

            if (isLastAttempt) {
                logger.error('Notification permanently failed after all retries', {
                    bullJobId: job.id,
                    type: job.data.type,
                    jobId: job.data.jobId,
                });
            }
        });

        // Worker is active
        this.worker.on('active', (job) => {
            logger.debug('Notification is now active', {
                bullJobId: job.id,
                type: job.data.type,
            });
        });

        // Worker stalled
        this.worker.on('stalled', (jobId) => {
            logger.warn('Notification stalled', {
                bullJobId: jobId,
            });
        });

        // Worker error
        this.worker.on('error', (error) => {
            logger.error('Notification worker error', {
                workerName: WORKER_NAME,
                error: error.message,
                stack: error.stack,
            });
        });

        // Worker ready
        this.worker.on('ready', () => {
            logger.info('Notification worker is ready', {
                workerName: WORKER_NAME,
            });
        });

        // Worker closing
        this.worker.on('closing', () => {
            logger.info('Notification worker is closing', {
                workerName: WORKER_NAME,
            });
        });

        // Worker closed
        this.worker.on('closed', () => {
            logger.info('Notification worker closed', {
                workerName: WORKER_NAME,
            });
        });
    }

    /**
     * Stop the worker gracefully
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Notification worker is not running');
            return;
        }

        try {
            logger.info('Stopping notification worker gracefully', {
                workerName: WORKER_NAME,
            });

            // Close worker
            if (this.worker) {
                await this.worker.close();
                this.worker = null;
            }

            this.isRunning = false;

            logger.info('Notification worker stopped successfully', {
                workerName: WORKER_NAME,
            });

        } catch (error) {
            logger.error('Error stopping notification worker', {
                workerName: WORKER_NAME,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Pause the worker
     */
    async pause() {
        if (!this.worker) {
            logger.warn('Worker not initialized');
            return;
        }

        try {
            await this.worker.pause();
            logger.info('Notification worker paused', {
                workerName: WORKER_NAME,
            });
        } catch (error) {
            logger.error('Error pausing notification worker', {
                error: error.message,
            });
        }
    }

    /**
     * Resume the worker
     */
    async resume() {
        if (!this.worker) {
            logger.warn('Worker not initialized');
            return;
        }

        try {
            await this.worker.resume();
            logger.info('Notification worker resumed', {
                workerName: WORKER_NAME,
            });
        } catch (error) {
            logger.error('Error resuming notification worker', {
                error: error.message,
            });
        }
    }

    /**
     * Get worker metrics
     */
    getMetrics() {
        return {
            isRunning: this.isRunning,
            workerName: WORKER_NAME,
            concurrency: NOTIFICATION_WORKER_CONCURRENCY,
            isPaused: this.worker?.isPaused() || false,
        };
    }
}

// Export singleton instance
const notificationWorker = new NotificationWorker();

module.exports = notificationWorker;