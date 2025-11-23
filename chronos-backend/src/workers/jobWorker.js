const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../config/redis');
const { QUEUE_NAMES } = require('../config/queue');
const executionService = require('../services/executionService');
const { addNotificationToQueue } = require('../config/queue');
const logger = require('../config/logger');

// Worker configuration
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');
const WORKER_NAME = process.env.WORKER_NAME || `worker-${process.pid}`;

/**
 * Job Worker
 * Processes jobs from the job-execution-queue
 * Handles job execution, retries, and failures
 */
class JobWorker {
    constructor() {
        this.worker = null;
        this.connection = null;
        this.isRunning = false;
    }

    /**
     * Start the worker
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Job worker is already running');
            return;
        }

        try {
            logger.info('Starting job worker', {
                workerName: WORKER_NAME,
                concurrency: WORKER_CONCURRENCY,
                queue: QUEUE_NAMES.JOBS,
            });

            // Create BullMQ connection with proper config
            this.connection = createBullMQConnection();
            // BullMQ requires maxRetriesPerRequest to be null
            this.connection.options.maxRetriesPerRequest = null;

            // Create worker
            this.worker = new Worker(
                QUEUE_NAMES.JOBS,
                async (job) => {
                    return await this.processJob(job);
                },
                {
                    connection: this.connection,
                    concurrency: WORKER_CONCURRENCY,
                    limiter: {
                        max: 100, // Process max 100 jobs
                        duration: 60000, // Per 60 seconds (1 minute)
                    },
                    // Graceful shutdown settings
                    lockDuration: 30000, // 30 seconds lock
                    stalledInterval: 30000, // Check for stalled jobs every 30s
                }
            );

            // Set up event listeners
            this.setupEventListeners();

            this.isRunning = true;
            logger.info('Job worker started successfully', {
                workerName: WORKER_NAME,
                concurrency: WORKER_CONCURRENCY,
            });

        } catch (error) {
            logger.error('Error starting job worker', {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    }

    /**
     * Process a job from the queue
     * @param {Object} job - Bull job instance
     * @returns {Promise<Object>} Job result
     */
    async processJob(job) {
        const startTime = Date.now();

        logger.info('Processing job', {
            bullJobId: job.id,
            jobId: job.data.jobId,
            name: job.data.name,
            attempt: job.attemptsMade + 1,
            maxRetries: job.opts.attempts,
        });

        try {
            // Execute the job using executionService
            const result = await executionService.executeJob(job.data, job);

            const duration = Date.now() - startTime;

            // If job was skipped (not found in DB), don't treat as error
            if (result.skipped) {
                logger.info('Job skipped', {
                    bullJobId: job.id,
                    jobId: job.data.jobId,
                    reason: result.reason,
                    duration,
                });
                return result;
            }

            logger.info('Job processed successfully', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                duration,
                success: result.success,
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Job processing failed', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                attempt: job.attemptsMade + 1,
                maxRetries: job.opts.attempts,
                error: error.message,
                duration,
            });

            // Re-throw error to trigger Bull's retry mechanism
            throw error;
        }
    }

    /**
     * Set up event listeners for the worker
     */
    setupEventListeners() {
        // Job completed successfully
        this.worker.on('completed', (job, result) => {
            logger.info('Job completed', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                name: job.data.name,
                result: result,
            });
        });

        // Job failed
        this.worker.on('failed', async (job, error) => {
            const isLastAttempt = job.attemptsMade >= job.opts.attempts;

            logger.error('Job failed', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                name: job.data.name,
                attempt: job.attemptsMade,
                maxRetries: job.opts.attempts,
                isLastAttempt,
                error: error.message,
            });

            // If this was the last attempt, handle permanent failure
            if (isLastAttempt) {
                await this.handlePermanentFailure(job, error);
            }
        });

        // Worker is active
        this.worker.on('active', (job) => {
            logger.debug('Job is now active', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                name: job.data.name,
            });
        });

        // Worker stalled (taking too long)
        this.worker.on('stalled', (jobId) => {
            logger.warn('Job stalled', {
                bullJobId: jobId,
            });
        });

        // Worker error
        this.worker.on('error', (error) => {
            logger.error('Worker error', {
                workerName: WORKER_NAME,
                error: error.message,
                stack: error.stack,
            });
        });

        // Worker ready
        this.worker.on('ready', () => {
            logger.info('Worker is ready to process jobs', {
                workerName: WORKER_NAME,
            });
        });

        // Worker closing
        this.worker.on('closing', () => {
            logger.info('Worker is closing', {
                workerName: WORKER_NAME,
            });
        });

        // Worker closed
        this.worker.on('closed', () => {
            logger.info('Worker closed', {
                workerName: WORKER_NAME,
            });
        });
    }

    /**
     * Handle permanent job failure (after all retries)
     * @param {Object} job - Bull job instance
     * @param {Error} error - Final error
     */
    async handlePermanentFailure(job, error) {
        try {
            logger.error('Job permanently failed after all retries', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                name: job.data.name,
                attempts: job.attemptsMade,
                error: error.message,
            });

            // Call executionService to handle failure
            await executionService.handleJobFailure(job.data, error);

            // Send notification about failure
            await addNotificationToQueue({
                type: 'job_failure',
                jobId: job.data.jobId,
                jobName: job.data.name,
                userId: job.data.userId,
                error: error.message,
                attempts: job.attemptsMade,
                timestamp: new Date(),
            });

            logger.info('Failure notification queued', {
                jobId: job.data.jobId,
            });

        } catch (err) {
            logger.error('Error handling permanent failure', {
                bullJobId: job.id,
                jobId: job.data.jobId,
                error: err.message,
            });
        }
    }

    /**
     * Stop the worker gracefully
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Job worker is not running');
            return;
        }

        try {
            logger.info('Stopping job worker gracefully', {
                workerName: WORKER_NAME,
            });

            // Close worker (waits for active jobs to finish)
            if (this.worker) {
                await this.worker.close();
                this.worker = null;
            }

            this.isRunning = false;

            logger.info('Job worker stopped successfully', {
                workerName: WORKER_NAME,
            });

        } catch (error) {
            logger.error('Error stopping job worker', {
                workerName: WORKER_NAME,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Pause the worker (stops accepting new jobs)
     */
    async pause() {
        if (!this.worker) {
            logger.warn('Worker not initialized');
            return;
        }

        try {
            await this.worker.pause();
            logger.info('Worker paused', {
                workerName: WORKER_NAME,
            });
        } catch (error) {
            logger.error('Error pausing worker', {
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
            logger.info('Worker resumed', {
                workerName: WORKER_NAME,
            });
        } catch (error) {
            logger.error('Error resuming worker', {
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
            concurrency: WORKER_CONCURRENCY,
            isPaused: this.worker?.isPaused() || false,
        };
    }
}

// Export singleton instance
const jobWorker = new JobWorker();

module.exports = jobWorker;