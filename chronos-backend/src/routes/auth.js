const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { strictRateLimiter, standardRateLimiter } = require('../middleware/rateLimiter');
const { validationMiddleware, schemas } = require('../utils/validators');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  strictRateLimiter, // 5 requests per 15 minutes
  validationMiddleware(schemas.userRegister, 'body'),
  asyncHandler(AuthController.register)
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  strictRateLimiter, // 5 requests per 15 minutes
  validationMiddleware(schemas.userLogin, 'body'),
  asyncHandler(AuthController.login)
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (blacklist token)
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(AuthController.logout)
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(AuthController.me)
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post(
  '/refresh',
  authenticate,
  standardRateLimiter, // 100 requests per hour
  asyncHandler(AuthController.refresh)
);

/**
 * @route   POST /api/auth/validate-password
 * @desc    Validate password strength (utility endpoint)
 * @access  Public
 */
router.post(
  '/validate-password',
  asyncHandler(AuthController.validatePassword)
);

module.exports = router;