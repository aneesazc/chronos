const { db } = require('../config/database');
const { getQueueMetrics } = require('../config/queue');
const { redisClient } = require('../config/redis');
const Job = require('../models/Job');
const logger = require('../config/logger');

/**
 * Dashboard Controller
 * Provides statistics and metrics for the dashboard
 */
class DashboardController {
    /**
     * Get dashboard statistics
     * GET /api/v1/dashboard/stats
     */
    static async getStats(req, res) {
        try {
            const userId = req.user.id;

            // Get job statistics
            const jobStats = await db.one(
                `SELECT 
                    COUNT(*) as total_jobs,
                    COUNT(*) FILTER (WHERE j.status = 'active') as active_jobs,
                    COUNT(*) FILTER (WHERE j.status = 'completed') as completed_jobs,
                    COUNT(*) FILTER (WHERE j.status = 'paused') as paused_jobs,
                    COUNT(*) FILTER (WHERE j.status = 'failed') as failed_jobs,
                    COUNT(*) FILTER (WHERE j.job_type = 'one-time') as onetime_jobs,
                    COUNT(*) FILTER (WHERE j.job_type = 'recurring') as recurring_jobs
                FROM jobs j
                WHERE j.user_id = $1 AND j.status != 'deleted'`,
                [userId]
            );

            // Get execution statistics (last 24 hours)
            const executionStats = await db.one(
                `SELECT 
                    COUNT(*) as total_executions,
                    COUNT(*) FILTER (WHERE je.status = 'success') as successful_executions,
                    COUNT(*) FILTER (WHERE je.status = 'failed') as failed_executions,
                    AVG(je.duration_ms) FILTER (WHERE je.status = 'success') as avg_duration_ms,
                    MAX(je.duration_ms) FILTER (WHERE je.status = 'success') as max_duration_ms,
                    MIN(je.duration_ms) FILTER (WHERE je.status = 'success') as min_duration_ms
                FROM job_executions je
                JOIN jobs j ON j.id = je.job_id
                WHERE j.user_id = $1 
                AND je.created_at >= NOW() - INTERVAL '24 hours'`,
                [userId]
            );

            // Get upcoming jobs (next 24 hours)
            const upcomingJobs = await db.any(
                `SELECT id, name, next_run, cron_expression, job_type
                FROM jobs
                WHERE user_id = $1 
                AND status = 'active'
                AND next_run <= NOW() + INTERVAL '24 hours'
                ORDER BY next_run ASC
                LIMIT 10`,
                [userId]
            );

            // Get recent executions
            const recentExecutions = await db.any(
                `SELECT 
                    je.id,
                    je.job_id,
                    j.name as job_name,
                    je.status,
                    je.execution_time,
                    je.duration_ms,
                    je.error_message
                FROM job_executions je
                JOIN jobs j ON j.id = je.job_id
                WHERE j.user_id = $1
                ORDER BY je.execution_time DESC
                LIMIT 10`,
                [userId]
            );

            // Calculate success rate
            const totalExecs = parseInt(executionStats.total_executions) || 0;
            const successfulExecs = parseInt(executionStats.successful_executions) || 0;
            const successRate = totalExecs > 0 ? ((successfulExecs / totalExecs) * 100).toFixed(2) : 0;

            res.json({
                success: true,
                data: {
                    jobs: {
                        total: parseInt(jobStats.total_jobs),
                        active: parseInt(jobStats.active_jobs),
                        completed: parseInt(jobStats.completed_jobs),
                        paused: parseInt(jobStats.paused_jobs),
                        failed: parseInt(jobStats.failed_jobs),
                        onetime: parseInt(jobStats.onetime_jobs),
                        recurring: parseInt(jobStats.recurring_jobs),
                    },
                    executions: {
                        total: totalExecs,
                        successful: successfulExecs,
                        failed: parseInt(executionStats.failed_executions) || 0,
                        success_rate: parseFloat(successRate),
                        avg_duration_seconds: executionStats.avg_duration_ms
                            ? parseFloat(executionStats.avg_duration_ms / 1000).toFixed(2)
                            : 0,
                        max_duration_seconds: executionStats.max_duration_ms
                            ? parseFloat(executionStats.max_duration_ms / 1000).toFixed(2)
                            : 0,
                        min_duration_seconds: executionStats.min_duration_ms
                            ? parseFloat(executionStats.min_duration_ms / 1000).toFixed(2)
                            : 0,
                    },
                    upcoming_jobs: upcomingJobs.map(job => ({
                        id: job.id,
                        name: job.name,
                        next_run: job.next_run,
                        cron_expression: job.cron_expression,
                        job_type: job.job_type,
                    })),
                    recent_executions: recentExecutions.map(exec => ({
                        id: exec.id,
                        job_id: exec.job_id,
                        job_name: exec.job_name,
                        status: exec.status,
                        execution_time: exec.execution_time,
                        duration_ms: exec.duration_ms,
                        error_message: exec.error_message,
                    })),
                },
            });

            logger.info('Dashboard stats retrieved', { userId });
        } catch (error) {
            logger.error('Error getting dashboard stats:', {
                error: error.message,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve dashboard statistics',
            });
        }
    }

    /**
     * Get system health and queue metrics
     * GET /api/v1/dashboard/health
     */
    static async getHealth(req, res) {
        try {
            // Check database connection
            let dbStatus = 'healthy';
            let dbLatency = 0;
            try {
                const start = Date.now();
                await db.one('SELECT NOW()');
                dbLatency = Date.now() - start;
            } catch (error) {
                dbStatus = 'unhealthy';
                logger.error('Database health check failed:', error);
            }

            // Check Redis connection
            let redisStatus = 'healthy';
            let redisLatency = 0;
            try {
                const start = Date.now();
                await redisClient.ping();
                redisLatency = Date.now() - start;
            } catch (error) {
                redisStatus = 'unhealthy';
                logger.error('Redis health check failed:', error);
            }

            // Get queue metrics
            let queueMetrics = null;
            let queueStatus = 'healthy';
            try {
                queueMetrics = await getQueueMetrics();
                
                // Check if queue is backed up
                const totalWaiting = (queueMetrics.jobs?.waiting || 0) + (queueMetrics.jobs?.delayed || 0);
                if (totalWaiting > 1000) {
                    queueStatus = 'degraded';
                }
            } catch (error) {
                queueStatus = 'unhealthy';
                logger.error('Queue metrics check failed:', error);
            }

            // Determine overall status
            let overallStatus = 'healthy';
            if (dbStatus === 'unhealthy' || redisStatus === 'unhealthy' || queueStatus === 'unhealthy') {
                overallStatus = 'unhealthy';
            } else if (queueStatus === 'degraded') {
                overallStatus = 'degraded';
            }

            const statusCode = overallStatus === 'healthy' ? 200 : 503;

            res.status(statusCode).json({
                success: overallStatus === 'healthy',
                status: overallStatus,
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                services: {
                    database: {
                        status: dbStatus,
                        latency_ms: dbLatency,
                    },
                    redis: {
                        status: redisStatus,
                        latency_ms: redisLatency,
                    },
                    queue: {
                        status: queueStatus,
                        metrics: queueMetrics,
                    },
                },
                system: {
                    uptime_seconds: Math.floor(process.uptime()),
                    memory: {
                        used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    },
                    node_version: process.version,
                    environment: process.env.NODE_ENV || 'development',
                },
            });

            logger.debug('Health check completed', { status: overallStatus });
        } catch (error) {
            logger.error('Error in health check:', error);
            res.status(500).json({
                success: false,
                status: 'error',
                error: 'Failed to perform health check',
            });
        }
    }

    /**
     * Get execution timeline (last 7 days)
     * GET /api/v1/dashboard/timeline
     */
    static async getTimeline(req, res) {
        try {
            const userId = req.user.id;
            const days = parseInt(req.query.days) || 7;

            if (days > 30) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 30 days allowed',
                });
            }

            // Get execution counts per day
            const timeline = await db.any(
                `SELECT 
                    DATE(je.execution_time) as date,
                    COUNT(*) as total_executions,
                    COUNT(*) FILTER (WHERE je.status = 'success') as successful_executions,
                    COUNT(*) FILTER (WHERE je.status = 'failed') as failed_executions,
                    AVG(je.duration_ms) FILTER (WHERE je.status = 'success') as avg_duration_ms
                FROM job_executions je
                JOIN jobs j ON j.id = je.job_id
                WHERE j.user_id = $1 
                AND je.execution_time >= NOW() - INTERVAL '${days} days'
                GROUP BY DATE(je.execution_time)
                ORDER BY date ASC`,
                [userId]
            );

            res.json({
                success: true,
                data: timeline.map(day => ({
                    date: day.date,
                    total_executions: parseInt(day.total_executions),
                    successful_executions: parseInt(day.successful_executions),
                    failed_executions: parseInt(day.failed_executions),
                    avg_duration_ms: day.avg_duration_ms 
                        ? Math.round(parseFloat(day.avg_duration_ms))
                        : 0,
                })),
            });

            logger.info('Timeline retrieved', { userId, days });
        } catch (error) {
            logger.error('Error getting timeline:', {
                error: error.message,
                userId: req.user.id,
            });
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve timeline data',
            });
        }
    }
}

module.exports = DashboardController;
