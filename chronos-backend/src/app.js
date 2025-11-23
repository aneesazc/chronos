const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('express-async-errors'); // Automatically catch async errors
const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { db } = require('./config/database');
const { redisClient } = require('./config/redis');

// Import routes
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const executionRoutes = require('./routes/executions');
const dashboardRoutes = require('./routes/dashboard');

// Create Express app
const app = express();

// Trust proxy (for rate limiting with IP behind load balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`, {
      query: req.query,
      body: req.body,
      ip: req.ip,
    });
    next();
  });
}

// Basic health check endpoint (public)
app.get('/health', async (req, res) => {
  try {
    // Quick health check - just verify connections
    let dbHealthy = false;
    let redisHealthy = false;

    try {
      await db.one('SELECT 1 as check');
      dbHealthy = true;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }

    try {
      await redisClient.ping();
      redisHealthy = true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }

    const isHealthy = dbHealthy && redisHealthy;
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

// API version info
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Chronos Job Scheduler API',
    version: '1.0.0',
    documentation: '/api',
    endpoints: {
      auth: '/api/v1/auth',
      jobs: '/api/v1/jobs',
      executions: '/api/v1/executions',
      dashboard: '/api/v1/dashboard',
    },
  });
});

// API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/executions', executionRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Also support /api/auth, /api/jobs for backward compatibility
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;