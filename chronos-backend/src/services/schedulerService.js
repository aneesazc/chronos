const Job = require('../models/Job');
const { addJobToQueue, getQueueDepth } = require('../config/queue');
const { calculateDelay } = require('../utils/dateUtils');
const logger = require('../config/logger');

class SchedulerService {
    constructor() {
        this.syncInterval = null;
        this.syncIntervalMs = parseInt(process.env.SAFETY_SYNC_INTERVAL || '300000'); // 5 minutes
        this.isRunning = false;
    }

    /**
     * Start the scheduler service
     * - Runs safety sync every 5 minutes
     * - Checks PostgreSQL for missed jobs
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Scheduler service is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting scheduler service', {
            syncIntervalMs: this.syncIntervalMs,
        });

        // Run initial safety sync
        await this.runSafetySync();

        // Schedule periodic safety sync
        this.syncInterval = setInterval(async () => {
            await this.runSafetySync();
        }, this.syncIntervalMs);

        logger.info('Scheduler service started successfully');
    }

    /**
     * Stop the scheduler service
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Scheduler service is not running');
            return;
        }

        logger.info('Stopping scheduler service');

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        this.isRunning = false;
        logger.info('Scheduler service stopped successfully');
    }

    /**
     * Safety sync - Check PostgreSQL for missed jobs
     * 
     * This is the critical safety mechanism:
     * 1. Query PostgreSQL for jobs where next_run <= NOW() AND status = 'active'
     * 2. For each missed job, add to Bull queue with delay: 0
     * 3. This ensures we never miss a job even if:
     *    - Bull/Redis goes down temporarily
     *    - Worker crashes
     *    - Job was created while workers were offline
     */
    async runSafetySync() {
        try {
            const syncStartTime = Date.now();
            logger.info('Starting safety sync');

            // Get queue metrics before sync
            const queueDepthBefore = await getQueueDepth();

            // Query PostgreSQL for missed jobs
            const missedJobs = await this.findMissedJobs();

            if (missedJobs.length === 0) {
                logger.info('Safety sync completed - No missed jobs found', {
                    duration: Date.now() - syncStartTime,
                    queueDepth: queueDepthBefore,
                });
                return;
            }

            logger.info(`Found ${missedJobs.length} missed jobs`, {
                jobIds: missedJobs.map(j => j.id),
            });

            // Add missed jobs to queue
            let addedCount = 0;
            let failedCount = 0;

            for (const job of missedJobs) {
                try {
                    await this.addMissedJobToQueue(job);
                    addedCount++;
                } catch (error) {
                    failedCount++;
                    logger.error('Failed to add missed job to queue', {
                        jobId: job.id,
                        error: error.message,
                    });
                }
            }

            const queueDepthAfter = await getQueueDepth();

            logger.info('Safety sync completed', {
                duration: Date.now() - syncStartTime,
                missedJobsFound: missedJobs.length,
                addedToQueue: addedCount,
                failed: failedCount,
                queueDepthBefore,
                queueDepthAfter,
            });

        } catch (error) {
            logger.error('Error during safety sync', {
                error: error.message,
                stack: error.stack,
            });
        }
    }

    /**
     * Find jobs that should have been executed but are still active
     * 
     * Query: SELECT * FROM jobs 
     *        WHERE status = 'active' 
     *        AND next_run <= NOW()
     *        ORDER BY next_run ASC
     *        LIMIT 1000
     */
    async findMissedJobs() {
        try {
            // Direct database query to find missed jobs across all users
            const { db } = require('../config/database');
            
            const missedJobs = await db.any(
                `SELECT * FROM jobs 
                 WHERE status = 'active' 
                 AND next_run <= NOW()
                 ORDER BY next_run ASC
                 LIMIT 1000`,
                []
            );

            return missedJobs;
        } catch (error) {
            logger.error('Error finding missed jobs', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Add a missed job to the Bull queue
     * @param {Object} job - Job object from database
     */
    async addMissedJobToQueue(job) {
        try {
            // Check if job is already in the queue (idempotency)
            // BullMQ uses jobId as unique identifier, so duplicate adds will be rejected
            
            await addJobToQueue(
                {
                    jobId: job.id,
                    userId: job.user_id,
                    name: job.name,
                    payload: job.payload,
                    timeout: job.timeout_seconds,
                    missedExecution: true, // Flag to indicate this was a missed job
                },
                {
                    delay: 0, // Execute immediately
                    jobId: job.id, // Use job UUID for idempotency
                }
            );

            logger.info('Missed job added to queue', {
                jobId: job.id,
                name: job.name,
                originalNextRun: job.next_run,
            });

        } catch (error) {
            // If error is about duplicate job ID, it's already in queue (safe to ignore)
            if (error.message && error.message.includes('already exists')) {
                logger.debug('Job already in queue (idempotent)', {
                    jobId: job.id,
                });
            } else {
                throw error;
            }
        }
    }

    /**
     * Schedule a new job (called when job is created)
     * @param {Object} job - Job object from database
     */
    async scheduleJob(job) {
        try {
            const delay = calculateDelay(new Date(job.next_run));

            await addJobToQueue(
                {
                    jobId: job.id,
                    userId: job.user_id,
                    name: job.name,
                    payload: job.payload,
                    timeout: job.timeout_seconds,
                },
                {
                    delay,
                    jobId: job.id,
                }
            );

            logger.info('Job scheduled', {
                jobId: job.id,
                name: job.name,
                next_run: job.next_run,
                delay,
            });

        } catch (error) {
            logger.error('Error scheduling job', {
                jobId: job.id,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Reschedule a recurring job after execution
     * @param {Object} job - Job object from database (with updated next_run)
     */
    async rescheduleRecurringJob(job) {
        try {
            if (job.job_type !== 'recurring') {
                logger.warn('Attempted to reschedule non-recurring job', {
                    jobId: job.id,
                    job_type: job.job_type,
                });
                return;
            }

            if (job.status !== 'active') {
                logger.info('Skipping rescheduling of non-active job', {
                    jobId: job.id,
                    status: job.status,
                });
                return;
            }

            const delay = calculateDelay(new Date(job.next_run));

            await addJobToQueue(
                {
                    jobId: job.id,
                    userId: job.user_id,
                    name: job.name,
                    payload: job.payload,
                    timeout: job.timeout_seconds,
                },
                {
                    delay,
                    jobId: job.id,
                }
            );

            logger.info('Recurring job rescheduled', {
                jobId: job.id,
                name: job.name,
                next_run: job.next_run,
                delay,
            });

        } catch (error) {
            logger.error('Error rescheduling recurring job', {
                jobId: job.id,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get scheduler metrics
     */
    getMetrics() {
        return {
            isRunning: this.isRunning,
            syncIntervalMs: this.syncIntervalMs,
            nextSyncIn: this.syncInterval ? this.syncIntervalMs : null,
        };
    }
}

// Export singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;