require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');
const { testConnection: testDbConnection } = require('./config/database');
const { testConnection: testRedisConnection, closeConnection: closeRedis } = require('./config/redis');

const PORT = process.env.PORT || 3000;

// Server instance
let server;

/**
 * Start the server
 */
async function startServer() {
    try {
        logger.info('Starting Chronos Job Scheduler API...');

        // Test database connection
        logger.info('Testing database connection...');
        const dbConnected = await testDbConnection();
        if (!dbConnected) {
            throw new Error('Failed to connect to database');
        }

        // Test Redis connection
        logger.info('Testing Redis connection...');
        const redisConnected = await testRedisConnection();
        if (!redisConnected) {
            throw new Error('Failed to connect to Redis');
        }

        // Start Express server
        server = app.listen(PORT, () => {
            logger.info(`✅ Server running on port ${PORT}`);
            logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`   Health check: http://localhost:${PORT}/health`);
            logger.info(`   API docs: http://localhost:${PORT}/api`);
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${PORT} is already in use`);
            } else {
                logger.error('Server error:', error);
            }
            process.exit(1);
        });
    } catch (error) {
        logger.error('Failed to start server:', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
        server.close(() => {
            logger.info('HTTP server closed');
        });
    }

    try {
        // Close Redis connection
        await closeRedis();
        logger.info('Redis connection closed');

        // Close database connections
        logger.info('Database connections closed');

        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
    });
    gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
        reason,
        promise,
    });
    gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();
