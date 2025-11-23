const logger = require('../config/logger');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 * Must be defined after all routes
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Log error details
  logger.error('Error occurred:', {
    error: message,
    stack: err.stack,
    statusCode,
    code,
    path: req.path,
    method: req.method,
    user: req.user?.id || 'anonymous',
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired token';
  }

  if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
  }

  if (err.code === '23503') {
    // PostgreSQL foreign key violation
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced resource does not exist';
  }

  if (err.code === '23502') {
    // PostgreSQL not null violation
    statusCode = 400;
    code = 'MISSING_REQUIRED_FIELD';
    message = 'Required field is missing';
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
  }

  // Send error response
  res.status(statusCode).json({
    error: true,
    message,
    code,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details,
    }),
  });
};

/**
 * 404 Not Found handler
 * Should be defined after all routes but before error handler
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: true,
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};