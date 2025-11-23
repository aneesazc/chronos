const { db } = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');

const SALT_ROUNDS = 10;

class User {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.email - User email
   * @param {string} userData.password - Plain text password
   * @returns {Promise<Object>} Created user (without password)
   */
  static async create({ email, password }) {
    try {
      // Hash password
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await db.one(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at, updated_at`,
        [email.toLowerCase().trim(), password_hash]
      );

      logger.info('User created', { userId: user.id, email: user.email });
      return user;
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        throw new Error('Email already exists');
      }
      logger.error('Error creating user:', { error: error.message });
      throw error;
    }
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByEmail(email) {
    try {
      const user = await db.oneOrNone(
        'SELECT * FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );
      return user;
    } catch (error) {
      logger.error('Error finding user by email:', { error: error.message });
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>} User object or null
   */
  static async findById(userId) {
    try {
      const user = await db.oneOrNone(
        'SELECT id, email, created_at, updated_at FROM users WHERE id = $1',
        [userId]
      );
      return user;
    } catch (error) {
      logger.error('Error finding user by ID:', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify user password
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Promise<Object|null>} User object (without password) if valid, null otherwise
   */
  static async verifyCredentials(email, password) {
    try {
      const user = await this.findByEmail(email);
      
      if (!user) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isValid) {
        return null;
      }

      // Return user without password hash
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Error verifying credentials:', { error: error.message });
      throw error;
    }
  }

  /**
   * Update user password
   * @param {string} userId - User UUID
   * @param {string} newPassword - New plain text password
   * @returns {Promise<boolean>} Success status
   */
  static async updatePassword(userId, newPassword) {
    try {
      const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      
      await db.none(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [password_hash, userId]
      );

      logger.info('User password updated', { userId });
      return true;
    } catch (error) {
      logger.error('Error updating password:', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete user (soft delete by removing personal data, keeping job history)
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(userId) {
    try {
      await db.none('DELETE FROM users WHERE id = $1', [userId]);
      logger.info('User deleted', { userId });
      return true;
    } catch (error) {
      logger.error('Error deleting user:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user statistics
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User statistics
   */
  static async getStats(userId) {
    try {
      const stats = await db.one(
        `SELECT 
          COUNT(j.id) as total_jobs,
          COUNT(CASE WHEN j.status = 'active' THEN 1 END) as active_jobs,
          COUNT(CASE WHEN j.status = 'paused' THEN 1 END) as paused_jobs,
          COUNT(CASE WHEN j.status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN j.status = 'failed' THEN 1 END) as failed_jobs
         FROM jobs j
         WHERE j.user_id = $1`,
        [userId]
      );

      return {
        total_jobs: parseInt(stats.total_jobs) || 0,
        active_jobs: parseInt(stats.active_jobs) || 0,
        paused_jobs: parseInt(stats.paused_jobs) || 0,
        completed_jobs: parseInt(stats.completed_jobs) || 0,
        failed_jobs: parseInt(stats.failed_jobs) || 0,
      };
    } catch (error) {
      logger.error('Error getting user stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if email exists
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if exists
   */
  static async emailExists(email) {
    try {
      const result = await db.oneOrNone(
        'SELECT 1 FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );
      return result !== null;
    } catch (error) {
      logger.error('Error checking email existence:', { error: error.message });
      throw error;
    }
  }
}

module.exports = User;