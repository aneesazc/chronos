const AuthService = require('../services/authService');
const { setWithExpiry } = require('../config/redis');
const logger = require('../config/logger');

class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  static async register(req, res, next) {
    try {
      const { email, password } = req.body;

      // Register user
      const result = await AuthService.register({ email, password });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
      if (error.message === 'Email already registered') {
        return res.status(409).json({
          error: true,
          message: 'Email already registered',
          code: 'EMAIL_EXISTS',
        });
      }

      next(error);
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Login user
      const result = await AuthService.login({ email, password });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      if (error.message === 'Invalid email or password') {
        return res.status(401).json({
          error: true,
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        });
      }

      next(error);
    }
  }

  /**
   * Logout user (blacklist token)
   * POST /api/auth/logout
   */
  static async logout(req, res, next) {
    try {
      const token = req.token;

      if (!token) {
        return res.status(400).json({
          error: true,
          message: 'No token provided',
        });
      }

      // Get token expiration
      const decoded = AuthService.decodeToken(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      // Add token to blacklist (will expire when token expires)
      if (expiresIn > 0) {
        await setWithExpiry(`session:blacklist:${token}`, 'true', expiresIn);
      }

      logger.info('User logged out', {
        userId: req.user.id,
        email: req.user.email,
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user info
   * GET /api/auth/me
   */
  static async me(req, res, next) {
    try {
      const { User } = require('../models');

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: true,
          message: 'User not found',
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh token
   * POST /api/auth/refresh
   */
  static async refresh(req, res, next) {
    try {
      const token = req.token;

      if (!token) {
        return res.status(400).json({
          error: true,
          message: 'No token provided',
        });
      }

      // Generate new token
      const result = await AuthService.refreshToken(token);

      // Blacklist old token
      const decoded = AuthService.decodeToken(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      if (expiresIn > 0) {
        await setWithExpiry(`session:blacklist:${token}`, 'true', expiresIn);
      }

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate password strength
   * POST /api/auth/validate-password
   */
  static async validatePassword(req, res, next) {
    try {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({
          error: true,
          message: 'Password is required',
        });
      }

      const validation = AuthService.validatePassword(password);

      res.status(200).json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;