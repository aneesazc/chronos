const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRATION = parseInt(process.env.JWT_EXPIRATION || '86400'); // 24 hours in seconds

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @returns {Promise<Object>} Created user and token
   */
  static async register({ email, password }) {
    try {
      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('Email already registered');
      }

      // Create new user (password will be hashed by User model)
      const user = await User.create({ email, password });

      // Generate JWT token
      const token = this.generateToken(user);

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
        token,
        expires_in: JWT_EXPIRATION,
      };
    } catch (error) {
      logger.error('Registration error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - User email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} User and token
   */
  static async login({ email, password }) {
    try {
      // Verify credentials
      const user = await User.verifyCredentials(email, password);

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Generate JWT token
      const token = this.generateToken(user);

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
        token,
        expires_in: JWT_EXPIRATION,
      };
    } catch (error) {
      logger.error('Login error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  static generateToken(user) {
    const payload = {
      user_id: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRATION,
    });
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Decode JWT token without verification (for checking expiration, etc.)
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  static decodeToken(token) {
    return jwt.decode(token);
  }

  /**
   * Get user from token
   * @param {string} token - JWT token
   * @returns {Promise<Object>} User object
   */
  static async getUserFromToken(token) {
    try {
      const decoded = this.verifyToken(token);
      const user = await User.findById(decoded.user_id);

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Get user from token error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh token (generate new token for existing user)
   * @param {string} oldToken - Current JWT token
   * @returns {Promise<Object>} New token
   */
  static async refreshToken(oldToken) {
    try {
      const decoded = this.verifyToken(oldToken);
      const user = await User.findById(decoded.user_id);

      if (!user) {
        throw new Error('User not found');
      }

      const newToken = this.generateToken(user);

      logger.info('Token refreshed', { userId: user.id });

      return {
        token: newToken,
        expires_in: JWT_EXPIRATION,
      };
    } catch (error) {
      logger.error('Token refresh error:', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result
   */
  static validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumber) {
      errors.push('Password must contain at least one number');
    }

    return {
      valid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(password),
    };
  }

  /**
   * Calculate password strength
   * @param {string} password - Password
   * @returns {string} Strength level (weak, medium, strong)
   */
  static calculatePasswordStrength(password) {
    let strength = 0;

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
  }
}

module.exports = AuthService;