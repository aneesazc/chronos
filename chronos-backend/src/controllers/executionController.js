const JobExecution = require('../models/JobExecution');
const JobLog = require('../models/JobLog');
const Job = require('../models/Job');
const logger = require('../config/logger');

/**
 * Execution Controller
 * Handles execution history and logs
 */
class ExecutionController {
    /**
     * Get executions for a specific job
     * GET /api/v1/jobs/:jobId/executions
     */
    static async getJobExecutions(req, res) {
        try {
            const { jobId } = req.params;
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const status = req.query.status; // optional filter

            // Verify job ownership
            const job = await Job.findByIdAndUser(jobId, userId);
            if (!job) {
                return res.status(404).json({
                    success: false,
                    error: 'Job not found',
                });
            }

            // Get executions
            const filters = {
                job_id: jobId,
                page,
                limit,
            };

            if (status) {
                filters.status = status;
            }

            const result = await JobExecution.list(filters);

            res.json({
                success: true,
                data: {
                    executions: result.executions,
                    pagination: result.pagination,
                },
            });

            logger.info('Job executions retrieved', {
                jobId,
                userId,
                page,
                count: result.executions.length,
            });
        } catch (error) {
            logger.error('Error getting job executions:', {
                error: error.message,
                jobId: req.params.jobId,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve job executions',
            });
        }
    }

    /**
     * Get execution details by ID
     * GET /api/v1/executions/:executionId
     */
    static async getExecutionById(req, res) {
        try {
            const { executionId } = req.params;
            const userId = req.user.id;

            // Get execution
            const execution = await JobExecution.findById(executionId);
            
            if (!execution) {
                return res.status(404).json({
                    success: false,
                    error: 'Execution not found',
                });
            }

            // Verify job ownership
            const job = await Job.findById(execution.job_id);
            if (!job || job.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            res.json({
                success: true,
                data: execution,
            });

            logger.info('Execution details retrieved', {
                executionId,
                userId,
            });
        } catch (error) {
            logger.error('Error getting execution:', {
                error: error.message,
                executionId: req.params.executionId,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve execution details',
            });
        }
    }

    /**
     * Get execution logs
     * GET /api/v1/executions/:executionId/logs
     */
    static async getExecutionLogs(req, res) {
        try {
            const { executionId } = req.params;
            const userId = req.user.id;

            // Get execution
            const execution = await JobExecution.findById(executionId);
            
            if (!execution) {
                return res.status(404).json({
                    success: false,
                    error: 'Execution not found',
                });
            }

            // Verify job ownership
            const job = await Job.findById(execution.job_id);
            if (!job || job.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            // Get logs
            const logs = await JobLog.findByExecution(executionId);

            res.json({
                success: true,
                data: {
                    execution_id: executionId,
                    logs: logs.map(log => ({
                        id: log.id,
                        level: log.level,
                        message: log.message,
                        metadata: log.metadata,
                        timestamp: log.timestamp,
                    })),
                },
            });

            logger.info('Execution logs retrieved', {
                executionId,
                userId,
                logCount: logs.length,
            });
        } catch (error) {
            logger.error('Error getting execution logs:', {
                error: error.message,
                executionId: req.params.executionId,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve execution logs',
            });
        }
    }

    /**
     * Get all executions for current user
     * GET /api/v1/executions
     */
    static async getAllExecutions(req, res) {
        try {
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const status = req.query.status; // optional filter

            // Get user's job IDs
            const userJobs = await Job.list({
                user_id: userId,
                limit: 1000, // Get all jobs
            });

            const jobIds = userJobs.jobs.map(job => job.id);

            if (jobIds.length === 0) {
                return res.json({
                    success: true,
                    data: {
                        executions: [],
                        pagination: {
                            total: 0,
                            page: 1,
                            limit: limit,
                            total_pages: 0,
                        },
                    },
                });
            }

            // Build filters
            const filters = {
                job_ids: jobIds,
                page,
                limit,
            };

            if (status) {
                filters.status = status;
            }

            const result = await JobExecution.list(filters);

            res.json({
                success: true,
                data: {
                    executions: result.executions,
                    pagination: result.pagination,
                },
            });

            logger.info('All executions retrieved', {
                userId,
                page,
                count: result.executions.length,
            });
        } catch (error) {
            logger.error('Error getting all executions:', {
                error: error.message,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve executions',
            });
        }
    }
}

module.exports = ExecutionController;