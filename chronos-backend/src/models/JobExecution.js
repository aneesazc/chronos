const { db } = require('../config/database');
const logger = require('../config/logger');

class JobExecution {
  /**
   * Create a new job execution record
   * @param {Object} executionData - Execution data
   * @returns {Promise<Object>} Created execution record
   */
  static async create(executionData) {
    try {
      const {
        job_id,
        status = 'running',
        retry_attempt = 0,
        execution_time = new Date(),
      } = executionData;

      const execution = await db.one(
        `INSERT INTO job_executions (
          job_id, execution_time, status, retry_attempt
        ) VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [job_id, execution_time, status, retry_attempt]
      );

      logger.debug('Execution record created', {
        executionId: execution.id,
        jobId: execution.job_id,
        status: execution.status,
      });

      return execution;
    } catch (error) {
      logger.error('Error creating execution record:', { error: error.message });
      throw error;
    }
  }

  /**
   * Update execution record
   * @param {string} executionId - Execution UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated execution
   */
  static async update(executionId, updates) {
    try {
      const allowedFields = ['status', 'duration_ms', 'error_message', 'output'];
      
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramIndex}`);
          values.push(key === 'output' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(executionId);

      const execution = await db.one(
        `UPDATE job_executions 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      logger.debug('Execution record updated', {
        executionId: execution.id,
        updates: Object.keys(updates),
      });

      return execution;
    } catch (error) {
      logger.error('Error updating execution record:', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark execution as success
   * @param {string} executionId - Execution UUID
   * @param {number} duration_ms - Execution duration in milliseconds
   * @param {Object} output - Job output data
   * @returns {Promise<Object>} Updated execution
   */
  static async markSuccess(executionId, duration_ms, output = null) {
    try {
      const execution = await db.one(
        `UPDATE job_executions 
         SET status = 'success', 
             duration_ms = $2,
             output = $3
         WHERE id = $1
         RETURNING *`,
        [executionId, duration_ms, output ? JSON.stringify(output) : null]
      );

      logger.info('Execution marked as success', {
        executionId: execution.id,
        duration_ms,
      });

      return execution;
    } catch (error) {
      logger.error('Error marking execution as success:', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark execution as failed
   * @param {string} executionId - Execution UUID
   * @param {number} duration_ms - Execution duration in milliseconds
   * @param {string} error_message - Error message
   * @returns {Promise<Object>} Updated execution
   */
  static async markFailed(executionId, duration_ms, error_message) {
    try {
      const execution = await db.one(
        `UPDATE job_executions 
         SET status = 'failed', 
             duration_ms = $2,
             error_message = $3
         WHERE id = $1
         RETURNING *`,
        [executionId, duration_ms, error_message]
      );

      logger.info('Execution marked as failed', {
        executionId: execution.id,
        error: error_message,
      });

      return execution;
    } catch (error) {
      logger.error('Error marking execution as failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark execution as timeout
   * @param {string} executionId - Execution UUID
   * @param {number} duration_ms - Execution duration in milliseconds
   * @returns {Promise<Object>} Updated execution
   */
  static async markTimeout(executionId, duration_ms) {
    try {
      const execution = await db.one(
        `UPDATE job_executions 
         SET status = 'timeout', 
             duration_ms = $2,
             error_message = 'Job execution timed out'
         WHERE id = $1
         RETURNING *`,
        [executionId, duration_ms]
      );

      logger.info('Execution marked as timeout', {
        executionId: execution.id,
        duration_ms,
      });

      return execution;
    } catch (error) {
      logger.error('Error marking execution as timeout:', { error: error.message });
      throw error;
    }
  }

  /**
   * Find execution by ID
   * @param {string} executionId - Execution UUID
   * @returns {Promise<Object|null>} Execution object or null
   */
  static async findById(executionId) {
    try {
      const execution = await db.oneOrNone(
        'SELECT * FROM job_executions WHERE id = $1',
        [executionId]
      );
      return execution;
    } catch (error) {
      logger.error('Error finding execution by ID:', { error: error.message });
      throw error;
    }
  }

  /**
   * List executions for a job with pagination
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Executions and pagination info
   */
  static async listByJob(params) {
    try {
      const {
        job_id,
        status,
        from_date,
        to_date,
        page = 1,
        limit = 20,
      } = params;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereConditions = ['job_id = $1'];
      let queryParams = [job_id];
      let paramIndex = 2;

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      if (from_date) {
        whereConditions.push(`execution_time >= $${paramIndex}`);
        queryParams.push(from_date);
        paramIndex++;
      }

      if (to_date) {
        whereConditions.push(`execution_time <= $${paramIndex}`);
        queryParams.push(to_date);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countResult = await db.one(
        `SELECT COUNT(*) as total FROM job_executions WHERE ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.total);

      // Get paginated results
      queryParams.push(limit, offset);
      const executions = await db.any(
        `SELECT * FROM job_executions 
         WHERE ${whereClause}
         ORDER BY execution_time DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      const total_pages = Math.ceil(total / limit);

      return {
        executions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages,
        },
      };
    } catch (error) {
      logger.error('Error listing executions:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get execution statistics for a job
   * @param {string} job_id - Job UUID
   * @returns {Promise<Object>} Execution statistics
   */
  static async getJobStats(job_id) {
    try {
      const stats = await db.one(
        `SELECT 
          COUNT(*) as total_executions,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'timeout' THEN 1 END) as timeout,
          ROUND(AVG(duration_ms)) as average_duration_ms,
          MAX(execution_time) as last_execution_time
         FROM job_executions
         WHERE job_id = $1`,
        [job_id]
      );

      const total = parseInt(stats.total_executions) || 0;
      const successful = parseInt(stats.successful) || 0;

      return {
        total_executions: total,
        successful_executions: successful,
        failed_executions: parseInt(stats.failed) || 0,
        timeout_executions: parseInt(stats.timeout) || 0,
        success_rate: total > 0 ? `${Math.round((successful / total) * 100)}%` : '0%',
        average_duration_ms: stats.average_duration_ms ? Math.round(stats.average_duration_ms) : null,
        last_execution_time: stats.last_execution_time,
      };
    } catch (error) {
      logger.error('Error getting job stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get last execution for a job
   * @param {string} job_id - Job UUID
   * @returns {Promise<Object|null>} Last execution or null
   */
  static async getLastExecution(job_id) {
    try {
      const execution = await db.oneOrNone(
        `SELECT * FROM job_executions
         WHERE job_id = $1
         ORDER BY execution_time DESC
         LIMIT 1`,
        [job_id]
      );
      return execution;
    } catch (error) {
      logger.error('Error getting last execution:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get recent failed executions for a job
   * @param {string} job_id - Job UUID
   * @param {number} limit - Number of results
   * @returns {Promise<Array>} Recent failed executions
   */
  static async getRecentFailures(job_id, limit = 5) {
    try {
      const executions = await db.any(
        `SELECT * FROM job_executions
         WHERE job_id = $1 AND status IN ('failed', 'timeout')
         ORDER BY execution_time DESC
         LIMIT $2`,
        [job_id, limit]
      );
      return executions;
    } catch (error) {
      logger.error('Error getting recent failures:', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete old executions (for cleanup)
   * @param {number} daysOld - Delete executions older than this many days
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteOldExecutions(daysOld = 90) {
    try {
      const result = await db.result(
        `DELETE FROM job_executions
         WHERE execution_time < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'`,
        []
      );

      logger.info('Old executions deleted', {
        count: result.rowCount,
        daysOld,
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Error deleting old executions:', { error: error.message });
      throw error;
    }
  }

  /**
   * List executions with flexible filtering
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Executions and pagination info
   */
  static async list(params) {
    try {
      const {
        job_id,
        job_ids, // Array of job IDs
        status,
        from_date,
        to_date,
        page = 1,
        limit = 20,
      } = params;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      // Handle single job_id or multiple job_ids
      if (job_id) {
        whereConditions.push(`job_id = $${paramIndex}`);
        queryParams.push(job_id);
        paramIndex++;
      } else if (job_ids && job_ids.length > 0) {
        whereConditions.push(`job_id = ANY($${paramIndex})`);
        queryParams.push(job_ids);
        paramIndex++;
      }

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      if (from_date) {
        whereConditions.push(`started_at >= $${paramIndex}`);
        queryParams.push(from_date);
        paramIndex++;
      }

      if (to_date) {
        whereConditions.push(`started_at <= $${paramIndex}`);
        queryParams.push(to_date);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ') 
        : '';

      // Get total count
      const countResult = await db.one(
        `SELECT COUNT(*) as total FROM job_executions ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.total);

      // Get paginated results
      queryParams.push(limit, offset);
      const executions = await db.any(
        `SELECT * FROM job_executions 
         ${whereClause}
         ORDER BY started_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      const total_pages = Math.ceil(total / limit);

      return {
        executions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages,
        },
      };
    } catch (error) {
      logger.error('Error listing executions:', { error: error.message });
      throw error;
    }
  }







}

module.exports = JobExecution;