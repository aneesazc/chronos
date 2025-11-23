const { Job } = require('../models/index');
const { getNextRun, isValidCronExpression, validateAndNormalize } = require('../utils/cronParser');
const { calculateDelay, isInPast } = require('../utils/dateUtils');
const { addJobToQueue, removeJobFromQueue } = require('../config/queue');
const logger = require('../config/logger');

class JobService {
    /**
     * Create a new job
     * @param {string} userId - User ID
     * @param {Object} jobData - Job data
     * @returns {Promise<Object>} Created job
     */
    static async createJob(userId, jobData) {
        try {
            const {
                name,
                description,
                job_type,
                schedule_type,
                scheduled_time,
                cron_expression,
                payload,
                timeout_seconds,
                max_retries,
            } = jobData;

            // Calculate next_run based on schedule_type
            let next_run;

            if (schedule_type === 'immediate') {
                next_run = new Date();
            } else if (schedule_type === 'scheduled') {
                next_run = new Date(scheduled_time);

                // Verify scheduled time is in the future
                if (isInPast(next_run)) {
                    throw new Error('Scheduled time must be in the future');
                }
            } else if (schedule_type === 'cron') {
                // Validate cron expression
                const validation = validateAndNormalize(cron_expression);
                if (!validation.valid) {
                    logger.error('Cron validation failed:', {
                        cron_expression,
                        error: validation.error,
                    });
                    throw new Error(`Invalid cron expression: ${validation.error}`);
                }

                // Calculate first run time
                next_run = getNextRun(cron_expression);
            }

            // Create job in database
            const job = await Job.create({
                user_id: userId,
                name,
                description,
                job_type,
                schedule_type,
                scheduled_time: schedule_type === 'scheduled' ? next_run : null,
                cron_expression: schedule_type === 'cron' ? cron_expression : null,
                next_run,
                payload: payload || {},
                timeout_seconds: timeout_seconds || 300,
                max_retries: max_retries || 3,
            });

            // Add to BullMQ queue
            const delay = calculateDelay(next_run);
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

            logger.info('Job created and queued', {
                jobId: job.id,
                userId,
                name: job.name,
                next_run: job.next_run,
                delay,
            });

            return job;
        } catch (error) {
            logger.error('Error creating job:', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }

    /**
     * Get jobs for a user with filters and pagination
     * @param {string} userId - User ID
     * @param {Object} filters - Filter options
     * @returns {Promise<Object>} Jobs and pagination
     */
    static async getJobs(userId, filters = {}) {
        try {
            const result = await Job.list({
                user_id: userId,
                ...filters,
            });

            return result;
        } catch (error) {
            logger.error('Error getting jobs:', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }

    /**
     * Get job by ID (with authorization check)
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Job with statistics
     */
    static async getJobById(jobId, userId) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Get job with statistics
            const jobWithStats = await Job.getWithStats(jobId);

            return jobWithStats;
        } catch (error) {
            logger.error('Error getting job:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Update job
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated job
     */
    static async updateJob(jobId, userId, updates) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Prevent updating completed or deleted jobs
            if (job.status === 'completed' || job.status === 'deleted') {
                throw new Error(`Cannot update ${job.status} job`);
            }

            // If updating cron expression, validate and recalculate next_run
            if (updates.cron_expression) {
                if (!isValidCronExpression(updates.cron_expression)) {
                    throw new Error('Invalid cron expression');
                }

                updates.next_run = getNextRun(updates.cron_expression);

                // Update in queue if job is active
                if (job.status === 'active') {
                    await removeJobFromQueue(jobId);
                    const delay = calculateDelay(updates.next_run);
                    await addJobToQueue(
                        {
                            jobId: job.id,
                            userId: job.user_id,
                            name: updates.name || job.name,
                            payload: updates.payload || job.payload,
                            timeout: updates.timeout_seconds || job.timeout_seconds,
                        },
                        {
                            delay,
                            jobId: job.id,
                        }
                    );
                }
            }

            // Update job
            const updatedJob = await Job.update(jobId, updates);

            logger.info('Job updated', {
                jobId,
                userId,
                updates: Object.keys(updates),
            });

            return updatedJob;
        } catch (error) {
            logger.error('Error updating job:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Delete job (soft delete)
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} Success status
     */
    static async deleteJob(jobId, userId) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Remove from queue if active
            if (job.status === 'active') {
                await removeJobFromQueue(jobId);
            }

            // Soft delete
            await Job.delete(jobId);

            logger.info('Job deleted', { jobId, userId });

            return true;
        } catch (error) {
            logger.error('Error deleting job:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Pause a recurring job
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Updated job
     */
    static async pauseJob(jobId, userId) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Validate job can be paused
            if (job.status !== 'active') {
                throw new Error('Only active jobs can be paused');
            }

            if (job.job_type !== 'recurring') {
                throw new Error('Only recurring jobs can be paused');
            }

            // Remove from queue
            await removeJobFromQueue(jobId);

            // Update status
            const pausedJob = await Job.pause(jobId);

            logger.info('Job paused', { jobId, userId });

            return pausedJob;
        } catch (error) {
            logger.error('Error pausing job:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Resume a paused job
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Updated job
     */
    static async resumeJob(jobId, userId) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Validate job can be resumed
            if (job.status !== 'paused') {
                throw new Error('Only paused jobs can be resumed');
            }

            // Calculate new next_run
            const next_run = getNextRun(job.cron_expression);

            // Resume job
            const resumedJob = await Job.resume(jobId, next_run);

            // Add back to queue
            const delay = calculateDelay(next_run);
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

            logger.info('Job resumed', {
                jobId,
                userId,
                next_run,
            });

            return resumedJob;
        } catch (error) {
            logger.error('Error resuming job:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Manually trigger job execution
     * @param {string} jobId - Job ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Execution info
     */
    static async executeJobManually(jobId, userId) {
        try {
            // Check authorization
            const job = await Job.findByIdAndUser(jobId, userId);

            if (!job) {
                throw new Error('Job not found');
            }

            // Cannot manually execute deleted jobs
            if (job.status === 'deleted') {
                throw new Error('Cannot execute deleted job');
            }

            // Add to queue with high priority and zero delay
            await addJobToQueue(
                {
                    jobId: job.id,
                    userId: job.user_id,
                    name: job.name,
                    payload: job.payload,
                    timeout: job.timeout_seconds,
                    manual: true, // Flag for manual execution
                },
                {
                    delay: 0,
                    priority: 1, // Higher priority than scheduled jobs
                }
            );

            logger.info('Job manually triggered', {
                jobId,
                userId,
            });

            return {
                jobId: job.id,
                status: 'queued',
                message: 'Job queued for immediate execution',
            };
        } catch (error) {
            logger.error('Error executing job manually:', {
                error: error.message,
                jobId,
                userId,
            });
            throw error;
        }
    }

    /**
     * Get upcoming jobs (next 24 hours)
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Upcoming jobs
     */
    static async getUpcomingJobs(userId) {
        try {
            const result = await Job.list({
                user_id: userId,
                status: 'active',
                limit: 100,
                sort_by: 'next_run',
                sort_order: 'ASC',
            });

            // Filter jobs scheduled within next 24 hours
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            const upcomingJobs = result.jobs.filter(job => {
                const nextRun = new Date(job.next_run);
                return nextRun >= now && nextRun <= tomorrow;
            });

            return upcomingJobs;
        } catch (error) {
            logger.error('Error getting upcoming jobs:', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }
}

module.exports = JobService;