const { db } = require('../config/database');
const logger = require('../config/logger');

class JobLog {
  /**
   * Create a new log entry
   * @param {Object} logData - Log data
   * @returns {Promise<Object>} Created log entry
   */
  static async create(logData) {
    try {
      const {
        execution_id,
        log_level = 'info',
        message,
        metadata = null,
        timestamp = new Date(),
      } = logData;

      const log = await db.one(
        `INSERT INTO job_logs (
          execution_id, log_level, message, metadata, timestamp
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          execution_id,
          log_level,
          message,
          metadata ? JSON.stringify(metadata) : null,
          timestamp,
        ]
      );

      logger.debug('Job log created', {
        logId: log.id,
        executionId: log.execution_id,
        level: log.log_level,
      });

      return log;
    } catch (error) {
      logger.error('Error creating job log:', { error: error.message });
      throw error;
    }
  }

  /**
   * Create multiple log entries at once (bulk insert)
   * @param {Array<Object>} logsData - Array of log data
   * @returns {Promise<number>} Number of logs created
   */
  static async createMany(logsData) {
    try {
      if (!logsData || logsData.length === 0) {
        return 0;
      }

      // Build values for bulk insert
      const values = [];
      const placeholders = [];
      
      logsData.forEach((log, index) => {
        const base = index * 5;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
        );
        values.push(
          log.execution_id,
          log.log_level || 'info',
          log.message,
          log.metadata ? JSON.stringify(log.metadata) : null,
          log.timestamp || new Date()
        );
      });

      const result = await db.result(
        `INSERT INTO job_logs (execution_id, log_level, message, metadata, timestamp)
         VALUES ${placeholders.join(', ')}`,
        values
      );

      logger.debug('Bulk job logs created', { count: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Error creating bulk job logs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get logs for an execution
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Logs and pagination info
   */
  static async getByExecution(params) {
    try {
      const {
        execution_id,
        log_level,
        limit = 100,
        offset = 0,
      } = params;

      // Build WHERE clause
      let whereConditions = ['execution_id = $1'];
      let queryParams = [execution_id];
      let paramIndex = 2;

      if (log_level) {
        whereConditions.push(`log_level = $${paramIndex}`);
        queryParams.push(log_level);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countResult = await db.one(
        `SELECT COUNT(*) as total FROM job_logs WHERE ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.total);

      // Get logs
      queryParams.push(limit, offset);
      const logs = await db.any(
        `SELECT * FROM job_logs 
         WHERE ${whereClause}
         ORDER BY timestamp ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      return {
        logs,
        total,
      };
    } catch (error) {
      logger.error('Error getting execution logs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get logs by level for an execution
   * @param {string} execution_id - Execution UUID
   * @param {string} log_level - Log level (info, warning, error, debug)
   * @returns {Promise<Array>} Array of logs
   */
  static async getByLevel(execution_id, log_level) {
    try {
      const logs = await db.any(
        `SELECT * FROM job_logs
         WHERE execution_id = $1 AND log_level = $2
         ORDER BY timestamp ASC`,
        [execution_id, log_level]
      );
      return logs;
    } catch (error) {
      logger.error('Error getting logs by level:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get error logs for an execution
   * @param {string} execution_id - Execution UUID
   * @returns {Promise<Array>} Array of error logs
   */
  static async getErrors(execution_id) {
    try {
      const logs = await db.any(
        `SELECT * FROM job_logs
         WHERE execution_id = $1 AND log_level = 'error'
         ORDER BY timestamp ASC`,
        [execution_id]
      );
      return logs;
    } catch (error) {
      logger.error('Error getting error logs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Log info message
   * @param {string} execution_id - Execution UUID
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Created log
   */
  static async info(execution_id, message, metadata = null) {
    return this.create({
      execution_id,
      log_level: 'info',
      message,
      metadata,
    });
  }

  /**
   * Log warning message
   * @param {string} execution_id - Execution UUID
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Created log
   */
  static async warning(execution_id, message, metadata = null) {
    return this.create({
      execution_id,
      log_level: 'warning',
      message,
      metadata,
    });
  }

  /**
   * Log error message
   * @param {string} execution_id - Execution UUID
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata (e.g., stack trace)
   * @returns {Promise<Object>} Created log
   */
  static async error(execution_id, message, metadata = null) {
    return this.create({
      execution_id,
      log_level: 'error',
      message,
      metadata,
    });
  }

  /**
   * Log debug message
   * @param {string} execution_id - Execution UUID
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Created log
   */
  static async debug(execution_id, message, metadata = null) {
    return this.create({
      execution_id,
      log_level: 'debug',
      message,
      metadata,
    });
  }

  /**
   * Get log statistics for an execution
   * @param {string} execution_id - Execution UUID
   * @returns {Promise<Object>} Log statistics
   */
  static async getStats(execution_id) {
    try {
      const stats = await db.one(
        `SELECT 
          COUNT(*) as total_logs,
          COUNT(CASE WHEN log_level = 'info' THEN 1 END) as info_count,
          COUNT(CASE WHEN log_level = 'warning' THEN 1 END) as warning_count,
          COUNT(CASE WHEN log_level = 'error' THEN 1 END) as error_count,
          COUNT(CASE WHEN log_level = 'debug' THEN 1 END) as debug_count
         FROM job_logs
         WHERE execution_id = $1`,
        [execution_id]
      );

      return {
        total: parseInt(stats.total_logs) || 0,
        info: parseInt(stats.info_count) || 0,
        warning: parseInt(stats.warning_count) || 0,
        error: parseInt(stats.error_count) || 0,
        debug: parseInt(stats.debug_count) || 0,
      };
    } catch (error) {
      logger.error('Error getting log stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete logs for an execution
   * @param {string} execution_id - Execution UUID
   * @returns {Promise<number>} Number of deleted logs
   */
  static async deleteByExecution(execution_id) {
    try {
      const result = await db.result(
        'DELETE FROM job_logs WHERE execution_id = $1',
        [execution_id]
      );

      logger.info('Execution logs deleted', {
        executionId: execution_id,
        count: result.rowCount,
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Error deleting execution logs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete old logs (for cleanup)
   * @param {number} daysOld - Delete logs older than this many days
   * @returns {Promise<number>} Number of deleted logs
   */
  static async deleteOldLogs(daysOld = 30) {
    try {
      const result = await db.result(
        `DELETE FROM job_logs
         WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'`,
        []
      );

      logger.info('Old logs deleted', {
        count: result.rowCount,
        daysOld,
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Error deleting old logs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Search logs by message content
   * @param {string} execution_id - Execution UUID
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Matching logs
   */
  static async search(execution_id, searchTerm) {
    try {
      const logs = await db.any(
        `SELECT * FROM job_logs
         WHERE execution_id = $1 
           AND message ILIKE $2
         ORDER BY timestamp ASC`,
        [execution_id, `%${searchTerm}%`]
      );
      return logs;
    } catch (error) {
      logger.error('Error searching logs:', { error: error.message });
      throw error;
    }
  }
}

module.exports = JobLog;