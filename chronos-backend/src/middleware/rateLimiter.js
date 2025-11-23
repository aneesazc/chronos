const { redisClient, incr, expire, exists } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Rate limiter middleware
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Function to generate rate limit key
 * @returns {Function} Express middleware
 */
const rateLimiter = (options = {}) => {
  const {
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'), // 1 hour
    max = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req) => {
      // Use user ID if authenticated, otherwise use IP address
      return req.user?.id || req.ip || req.connection.remoteAddress;
    },
  } = options;

  const windowSeconds = Math.floor(windowMs / 1000);

  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const rateLimitKey = `ratelimit:${key}:${Date.now() - (Date.now() % windowMs)}`;

      // Increment counter
      const count = await incr(rateLimitKey);

      // Set expiration on first request
      if (count === 1) {
        await expire(rateLimitKey, windowSeconds);
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

      // Check if limit exceeded
      if (count > max) {
        logger.warn('Rate limit exceeded', {
          key,
          count,
          max,
          path: req.path,
        });

        return res.status(429).json({
          error: true,
          message,
          retry_after: windowSeconds,
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error:', {
        error: error.message,
      });
      // On error, allow the request (fail open)
      next();
    }
  };
};

/**
 * Strict rate limiter for sensitive endpoints (login, register)
 */
const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    // Use IP address for login/register to prevent brute force
    return req.ip || req.connection.remoteAddress;
  },
});

/**
 * Standard rate limiter for general API endpoints
 */
const standardRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour
  message: 'Rate limit exceeded. Please try again in 1 hour.',
});

/**
 * Lenient rate limiter for public endpoints
 */
const lenientRateLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour
  message: 'Rate limit exceeded. Please try again later.',
});

module.exports = {
  rateLimiter,
  strictRateLimiter,
  standardRateLimiter,
  lenientRateLimiter,
};