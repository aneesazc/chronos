const express = require('express');
const router = express.Router();
const JobController = require('../controllers/jobController');
const { authenticate } = require('../middleware/auth');
const { standardRateLimiter } = require('../middleware/rateLimiter');
const { validationMiddleware, schemas } = require('../utils/validators');
const { asyncHandler } = require('../middleware/errorHandler');

// All job routes require authentication
router.use(authenticate);
router.use(standardRateLimiter); // 100 requests per hour

/**
 * @route   GET /api/jobs/upcoming
 * @desc    Get upcoming jobs (next 24 hours)
 * @access  Private
 * @note    Must be before /:id route to avoid conflict
 */
router.get(
  '/upcoming',
  asyncHandler(JobController.upcoming)
);

/**
 * @route   POST /api/jobs
 * @desc    Create a new job
 * @access  Private
 */
router.post(
  '/',
  validationMiddleware(schemas.jobCreate, 'body'),
  asyncHandler(JobController.create)
);

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs for authenticated user
 * @access  Private
 * @query   status, job_type, page, limit, sort_by, sort_order
 */
router.get(
  '/',
  validationMiddleware(schemas.jobListQuery, 'query'),
  asyncHandler(JobController.list)
);

/**
 * @route   GET /api/jobs/:id
 * @desc    Get job by ID
 * @access  Private
 */
router.get(
  '/:id',
  validationMiddleware(schemas.uuidParam, 'params'),
  asyncHandler(JobController.getById)
);

/**
 * @route   PATCH /api/jobs/:id
 * @desc    Update job
 * @access  Private
 */
router.patch(
  '/:id',
  validationMiddleware(schemas.uuidParam, 'params'),
  validationMiddleware(schemas.jobUpdate, 'body'),
  asyncHandler(JobController.update)
);

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete job (soft delete)
 * @access  Private
 */
router.delete(
  '/:id',
  validationMiddleware(schemas.uuidParam, 'params'),
  asyncHandler(JobController.delete)
);

/**
 * @route   POST /api/jobs/:id/pause
 * @desc    Pause a recurring job
 * @access  Private
 */
router.post(
  '/:id/pause',
  validationMiddleware(schemas.uuidParam, 'params'),
  asyncHandler(JobController.pause)
);

/**
 * @route   POST /api/jobs/:id/resume
 * @desc    Resume a paused job
 * @access  Private
 */
router.post(
  '/:id/resume',
  validationMiddleware(schemas.uuidParam, 'params'),
  asyncHandler(JobController.resume)
);

/**
 * @route   POST /api/jobs/:id/execute
 * @desc    Manually trigger job execution
 * @access  Private
 */
router.post(
  '/:id/execute',
  validationMiddleware(schemas.uuidParam, 'params'),
  asyncHandler(JobController.execute)
);

module.exports = router;