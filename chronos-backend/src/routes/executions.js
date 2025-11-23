const express = require('express');
const router = express.Router();
const ExecutionController = require('../controllers/executionController');
const { authenticate } = require('../middleware/auth');
const { standardRateLimiter } = require('../middleware/rateLimiter');

/**
 * Execution Routes
 * All routes require authentication
 */

// Apply authentication to all execution routes
router.use(authenticate);

// Apply rate limiting (100 requests per hour per user)
router.use(standardRateLimiter);

/**
 * @route   GET /api/v1/executions
 * @desc    Get all executions for current user
 * @access  Private
 * @query   page, limit, status
 */
router.get('/', ExecutionController.getAllExecutions);

/**
 * @route   GET /api/v1/executions/:executionId
 * @desc    Get execution details by ID
 * @access  Private
 */
router.get('/:executionId', ExecutionController.getExecutionById);

/**
 * @route   GET /api/v1/executions/:executionId/logs
 * @desc    Get execution logs
 * @access  Private
 */
router.get('/:executionId/logs', ExecutionController.getExecutionLogs);

module.exports = router;