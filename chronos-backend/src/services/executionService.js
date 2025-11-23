const { Job } = require('../models/index');
console.log("Job.updateLastExecuted exists:", typeof Job.updateLastExecuted);



const JobExecution = require('../models/JobExecution');
const JobLog = require('../models/JobLog');
const { getNextRun } = require('../utils/cronParser');
const logger = require('../config/logger');

class ExecutionService {
    /**
     * Execute a job and handle success/failure
     * @param {Object} jobData - Job data from Bull queue
     * @param {Object} bullJob - Bull job instance
     * @returns {Promise<Object>} Execution result
     */
    async executeJob(jobData, bullJob) {
        const { jobId, userId, name, payload, timeout, manual, missedExecution } = jobData;

        let execution = null;
        const startTime = Date.now();

        try {
            logger.info('Starting job execution', {
                jobId,
                userId,
                name,
                manual: manual || false,
                missedExecution: missedExecution || false,
                bullJobId: bullJob.id,
            });

            // Fetch full job details from database
            const job = await Job.findById(jobId);

            if (!job) {
                logger.warn('Job not found in database (may have been deleted)', {
                    jobId,
                    bullJobId: bullJob.id,
                });

                return {
                    success: false,
                    skipped: true,
                    reason: 'Job not found in database',
                };
            }

            // Verify job is still active (could have been deleted/paused)
            if (job.status !== 'active' && !manual) {
                logger.warn('Job is not active, skipping execution', {
                    jobId,
                    status: job.status,
                });
                return {
                    success: false,
                    skipped: true,
                    reason: `Job status is ${job.status}`,
                };
            }

            // Create execution record
            execution = await JobExecution.create({
                job_id: jobId,
                status: 'running',
                started_at: new Date(),
            });

            logger.info('Execution record created', {
                jobId,
                executionId: execution.id,
            });

            // Log execution start
            await this.addExecutionLog(execution.id, 'info', 'Job execution started', {
                jobName: name,
                payload,
                manual,
            });

            // Execute the job logic with timeout
            const executionResult = await this.runJobWithTimeout(
                job,
                execution,
                timeout
            );

            // Calculate duration
            const duration = Math.floor((Date.now() - startTime) / 1000);

            // Update execution as successful
            await JobExecution.update(execution.id, {
                status: 'success',
                completed_at: new Date(),
                duration_seconds: duration,
                result: executionResult,
            });

            // Log success
            await this.addExecutionLog(execution.id, 'info', 'Job completed successfully', {
                duration,
                result: executionResult,
            });

            // Update job's last_executed_at
            await Job.updateLastExecuted(jobId);

            logger.info('Job execution completed successfully', {
                jobId,
                executionId: execution.id,
                duration,
            });

            // Handle recurring jobs
            if (job.job_type === 'recurring' && job.status === 'active') {
                await this.handleRecurringJobReschedule(job);
            } else if (job.job_type === 'one-time') {
                // Mark one-time job as completed
                await Job.complete(jobId);
                logger.info('One-time job marked as completed', { jobId });
            }

            return {
                success: true,
                executionId: execution.id,
                duration,
                result: executionResult,
            };

        } catch (error) {
            const duration = Math.floor((Date.now() - startTime) / 1000);

            logger.error('Job execution failed', {
                jobId,
                executionId: execution?.id,
                error: error.message,
                stack: error.stack,
                duration,
            });

            // Update execution as failed
            if (execution) {
                await JobExecution.update(execution.id, {
                    status: 'failed',
                    completed_at: new Date(),
                    duration_seconds: duration,
                    error_message: error.message,
                    error_stack: error.stack,
                });

                // Log failure
                await this.addExecutionLog(execution.id, 'error', 'Job execution failed', {
                    error: error.message,
                    duration,
                });
            }

            // Throw error to trigger Bull retry mechanism
            throw error;
        }
    }

    /**
     * Run job logic with timeout protection
     * @param {Object} job - Job object
     * @param {Object} execution - Execution record
     * @param {number} timeoutSeconds - Timeout in seconds
     * @returns {Promise<Object>} Execution result
     */
    async runJobWithTimeout(job, execution, timeoutSeconds) {
        const timeoutMs = timeoutSeconds * 1000;

        return new Promise(async (resolve, reject) => {
            // Set timeout
            const timeoutHandle = setTimeout(() => {
                reject(new Error(`Job execution timeout after ${timeoutSeconds} seconds`));
            }, timeoutMs);

            try {
                // Execute the actual job logic
                const result = await this.executeJobLogic(job, execution);

                clearTimeout(timeoutHandle);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutHandle);
                reject(error);
            }
        });
    }

    /**
     * Execute the actual job logic
     * This is where the job's work is performed
     * 
     * @param {Object} job - Job object
     * @param {Object} execution - Execution record
     * @returns {Promise<Object>} Job execution result
     */
    async executeJobLogic(job, execution) {
        // Log job start
        await this.addExecutionLog(execution.id, 'info', 'Executing job logic', {
            payload: job.payload,
        });

        try {
            // IN-SYSTEM EXECUTION
            // This is a simple example implementation
            // In a production system, this could:
            // - Call external APIs
            // - Process data
            // - Send emails
            // - Generate reports
            // - Execute scripts
            // - etc.

            // For now, we'll simulate job execution
            const jobResult = await this.simulateJobExecution(job);

            await this.addExecutionLog(execution.id, 'info', 'Job logic completed', {
                result: jobResult,
            });

            return jobResult;

        } catch (error) {
            await this.addExecutionLog(execution.id, 'error', 'Job logic failed', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Simulate job execution (placeholder for actual job logic)
     * In production, replace this with actual job execution logic
     * 
     * @param {Object} job - Job object
     * @returns {Promise<Object>} Simulated result
     */
    async simulateJobExecution(job) {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Return success result
        return {
            status: 'completed',
            message: 'Job executed successfully',
            timestamp: new Date().toISOString(),
            jobId: job.id,
            jobName: job.name,
            payload: job.payload,
        };
    }

    /**
     * Handle rescheduling of recurring jobs
     * @param {Object} job - Job object
     */
    async handleRecurringJobReschedule(job) {
        try {
            // Calculate next run time based on cron expression
            const nextRun = getNextRun(job.cron_expression);

            // Update job's next_run in database
            await Job.update(job.id, {
                next_run: nextRun,
            });

            logger.info('Recurring job next_run updated', {
                jobId: job.id,
                next_run: nextRun,
            });

            // The scheduler service will pick this up in the next safety sync
            // OR we can immediately add it to the queue here
            // Lazy load to avoid circular dependency
            const schedulerService = require('../services/schedulerService');
            const updatedJob = await Job.findById(job.id);
            await schedulerService.rescheduleRecurringJob(updatedJob);

        } catch (error) {
            logger.error('Error rescheduling recurring job', {
                jobId: job.id,
                error: error.message,
            });
            // Don't throw - job was executed successfully, just rescheduling failed
        }
    }

    /**
     * Add a log entry for a job execution
     * @param {string} executionId - Execution ID
     * @param {string} level - Log level (info, warn, error)
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    async addExecutionLog(executionId, level, message, metadata = {}) {
        try {
            await JobLog.create({
                execution_id: executionId,
                level,
                message,
                metadata,
            });
        } catch (error) {
            logger.error('Error adding execution log', {
                executionId,
                error: error.message,
            });
            // Don't throw - logging failure shouldn't stop execution
        }
    }

    /**
     * Handle job execution failure after all retries
     * This is called by Bull when a job fails after max retries
     * 
     * @param {Object} jobData - Job data
     * @param {Error} error - Final error
     */
    async handleJobFailure(jobData, error) {
        const { jobId, name, userId } = jobData;

        try {
            logger.error('Job failed after all retries', {
                jobId,
                name,
                error: error.message,
            });

            // Get the job from database
            const job = await Job.findById(jobId);

            if (!job) {
                logger.error('Job not found for failure handling', { jobId });
                return;
            }

            // Add notification to queue
            const { addNotificationToQueue } = require('../config/queue');
            await addNotificationToQueue({
                type: 'job_failure',
                jobId: job.id,
                jobName: job.name,
                userId: job.user_id,
                error: error.message,
                attempts: 3,
                timestamp: new Date(),
            });

            logger.info('Failure notification scheduled', { jobId });

        } catch (err) {
            logger.error('Error handling job failure', {
                jobId,
                error: err.message,
            });
        }
    }

    /**
     * Get execution history for a job
     * @param {string} jobId - Job ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>} Executions with pagination
     */
    async getJobExecutions(jobId, options = {}) {
        try {
            const result = await JobExecution.list({
                job_id: jobId,
                ...options,
            });

            return result;
        } catch (error) {
            logger.error('Error getting job executions', {
                jobId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get execution details by ID
     * @param {string} executionId - Execution ID
     * @returns {Promise<Object>} Execution details
     */
    async getExecutionById(executionId) {
        try {
            const execution = await JobExecution.findById(executionId);

            if (!execution) {
                throw new Error('Execution not found');
            }

            return execution;
        } catch (error) {
            logger.error('Error getting execution', {
                executionId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get execution logs
     * @param {string} executionId - Execution ID
     * @returns {Promise<Array>} Execution logs
     */
    async getExecutionLogs(executionId) {
        try {
            const logs = await JobLog.findByExecution(executionId);
            return logs;
        } catch (error) {
            logger.error('Error getting execution logs', {
                executionId,
                error: error.message,
            });
            throw error;
        }
    }
}

// Export singleton instance
const executionService = new ExecutionService();

module.exports = executionService;