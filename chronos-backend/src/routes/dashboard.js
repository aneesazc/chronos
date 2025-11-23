const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { standardRateLimiter } = require('../middleware/rateLimiter');

/**
 * Dashboard Routes
 * All routes require authentication
 */

// Apply authentication to all dashboard routes
router.use(authenticate);

// Apply rate limiting (100 requests per hour per user)
router.use(standardRateLimiter);

/**
 * @route   GET /api/v1/dashboard/stats
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/stats', DashboardController.getStats);

/**
 * @route   GET /api/v1/dashboard/health
 * @desc    Get system health and queue metrics
 * @access  Private
 */
router.get('/health', DashboardController.getHealth);

/**
 * @route   GET /api/v1/dashboard/timeline
 * @desc    Get execution timeline (last N days)
 * @access  Private
 * @query   days - Number of days (default: 7, max: 30)
 */
router.get('/timeline', DashboardController.getTimeline);

module.exports = router;