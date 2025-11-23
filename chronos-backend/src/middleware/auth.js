const AuthService = require('../services/authService');
const { redisClient } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: true,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.exists(`session:blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        error: true,
        message: 'Token has been revoked. Please login again.',
      });
    }

    // Verify token
    const decoded = AuthService.verifyToken(token);

    // Attach user info to request
    req.user = {
      id: decoded.user_id,
      email: decoded.email,
    };

    req.token = token;

    next();
  } catch (error) {
    logger.error('Authentication error:', {
      error: error.message,
      path: req.path,
    });

    if (error.message === 'Token expired') {
      return res.status(401).json({
        error: true,
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.message === 'Invalid token') {
      return res.status(401).json({
        error: true,
        message: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      error: true,
      message: 'Authentication failed.',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for authenticated users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.exists(`session:blacklist:${token}`);
    if (isBlacklisted) {
      req.user = null;
      return next();
    }

    // Verify token
    const decoded = AuthService.verifyToken(token);

    req.user = {
      id: decoded.user_id,
      email: decoded.email,
    };

    req.token = token;

    next();
  } catch (error) {
    // If token verification fails, just set user to null
    req.user = null;
    next();
  }
};

/**
 * Middleware to check if user is authenticated
 * Use this after authenticate middleware for additional checks
 */
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      error: true,
      message: 'Authentication required.',
    });
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireAuth,
};