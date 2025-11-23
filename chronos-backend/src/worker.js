require('dotenv').config();
const schedulerService = require('./services/schedulerService');
const jobWorker = require('./workers/jobWorker');
const notificationWorker = require('./workers/notificationWorker');
const logger = require('./config/logger');
const { db } = require('./config/database');
const { redisClient } = require('./config/redis');

// Track shutdown state
let isShuttingDown = false;

/**
 * Start all worker services
 */
async function startWorkers() {
    try {
        logger.info('Starting Chronos Worker Process', {
            nodeEnv: process.env.NODE_ENV || 'development',
            pid: process.pid,
        });

        // Verify database connection
        logger.info('Verifying database connection...');
        await db.query('SELECT NOW()');
        logger.info('Database connection verified');

        // Verify Redis connection
        logger.info('Verifying Redis connection...');
        await redisClient.ping();
        logger.info('Redis connection verified');

        // Start scheduler service (safety sync)
        logger.info('Starting scheduler service...');
        await schedulerService.start();
        logger.info('Scheduler service started');

        // Start job worker
        logger.info('Starting job worker...');
        await jobWorker.start();
        logger.info('Job worker started');

        // Start notification worker
        logger.info('Starting notification worker...');
        await notificationWorker.start();
        logger.info('Notification worker started');

        logger.info('All worker services started successfully', {
            schedulerRunning: schedulerService.isRunning,
            jobWorkerRunning: jobWorker.isRunning,
            notificationWorkerRunning: notificationWorker.isRunning,
        });

        // Log worker metrics every 60 seconds
        setInterval(() => {
            logWorkerMetrics();
        }, 60000);

    } catch (error) {
        logger.error('Failed to start worker services', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

/**
 * Stop all worker services gracefully
 */
async function stopWorkers() {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
    }

    isShuttingDown = true;

    logger.info('Gracefully shutting down worker services...');

    try {
        // Stop scheduler service first
        logger.info('Stopping scheduler service...');
        await schedulerService.stop();
        logger.info('Scheduler service stopped');

        // Stop job worker (waits for active jobs to finish)
        logger.info('Stopping job worker...');
        await jobWorker.stop();
        logger.info('Job worker stopped');

        // Stop notification worker
        logger.info('Stopping notification worker...');
        await notificationWorker.stop();
        logger.info('Notification worker stopped');

        // Close database connection
        logger.info('Closing database connection...');
        await db.$pool.end();
        logger.info('Database connection closed');

        // Close Redis connection
        logger.info('Closing Redis connection...');
        await redisClient.quit();
        logger.info('Redis connection closed');

        logger.info('All worker services stopped successfully');
        process.exit(0);

    } catch (error) {
        logger.error('Error during graceful shutdown', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

/**
 * Log worker metrics
 */
function logWorkerMetrics() {
    const metrics = {
        scheduler: schedulerService.getMetrics(),
        jobWorker: jobWorker.getMetrics(),
        notificationWorker: notificationWorker.getMetrics(),
        memory: process.memoryUsage(),
        uptime: process.uptime(),
    };

    logger.info('Worker metrics', metrics);
}

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
        reason: reason,
        promise: promise,
    });
    process.exit(1);
});

/**
 * Handle graceful shutdown signals
 */
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await stopWorkers();
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal (Ctrl+C)');
    await stopWorkers();
});

/**
 * Start the worker process
 */
if (require.main === module) {
    startWorkers().catch((error) => {
        logger.error('Fatal error starting workers', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    });
}

module.exports = {
    startWorkers,
    stopWorkers,
};