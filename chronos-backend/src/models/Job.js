const { db } = require('../config/database');
const logger = require('../config/logger');

class Job {
  /**
   * Create a new job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job
   */
  static async create(jobData) {
    try {
      const {
        user_id,
        name,
        description,
        job_type,
        schedule_type,
        scheduled_time,
        cron_expression,
        next_run,
        payload,
        timeout_seconds,
        max_retries,
      } = jobData;

      const job = await db.one(
        `INSERT INTO jobs (
          user_id, name, description, job_type, schedule_type,
          scheduled_time, cron_expression, next_run, payload,
          timeout_seconds, max_retries, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
        RETURNING *`,
        [
          user_id,
          name,
          description || null,
          job_type,
          schedule_type,
          scheduled_time || null,
          cron_expression || null,
          next_run,
          JSON.stringify(payload || {}),
          timeout_seconds || 300,
          max_retries || 3,
        ]
      );

      logger.info('Job created', {
        jobId: job.id,
        userId: job.user_id,
        name: job.name,
        type: job.job_type,
      });

      return job;
    } catch (error) {
      logger.error('Error creating job:', { error: error.message });
      throw error;
    }
  }

  /**
   * Find job by ID
   * @param {string} jobId - Job UUID
   * @returns {Promise<Object|null>} Job object or null
   */
  static async findById(jobId) {
    try {
      const job = await db.oneOrNone('SELECT * FROM jobs WHERE id = $1', [jobId]);
      return job;
    } catch (error) {
      logger.error('Error finding job by ID:', { error: error.message });
      throw error;
    }
  }

  /**
   * Find job by ID and user ID (for authorization)
   * @param {string} jobId - Job UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>} Job object or null
   */
  static async findByIdAndUser(jobId, userId) {
    try {
      const job = await db.oneOrNone(
        'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
        [jobId, userId]
      );
      return job;
    } catch (error) {
      logger.error('Error finding job by ID and user:', { error: error.message });
      throw error;
    }
  }

  /**
   * List jobs for a user with filters and pagination
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Jobs and pagination info
   */
  static async list(params) {
    try {
      const {
        user_id,
        status,
        job_type,
        page = 1,
        limit = 20,
        sort_by = 'created_at',
        sort_order = 'DESC',
      } = params;

      const offset = (page - 1) * limit;
      const validSortColumns = ['created_at', 'next_run', 'name', 'updated_at'];
      const validSortOrders = ['ASC', 'DESC'];

      const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
      const sortDir = validSortOrders.includes(sort_order.toUpperCase())
        ? sort_order.toUpperCase()
        : 'DESC';

      // Build WHERE clause
      let whereConditions = ['user_id = $1', "status != 'deleted'"];
      let queryParams = [user_id];
      let paramIndex = 2;

      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      if (job_type) {
        whereConditions.push(`job_type = $${paramIndex}`);
        queryParams.push(job_type);
        paramIndex++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countResult = await db.one(
        `SELECT COUNT(*) as total FROM jobs WHERE ${whereClause}`,
        queryParams
      );
      const total = parseInt(countResult.total);

      // Get paginated results
      queryParams.push(limit, offset);
      const jobs = await db.any(
        `SELECT * FROM jobs 
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortDir}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        queryParams
      );

      const total_pages = Math.ceil(total / limit);

      return {
        jobs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages,
        },
      };
    } catch (error) {
      logger.error('Error listing jobs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Update job
   * @param {string} jobId - Job UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated job
   */
  static async update(jobId, updates) {
    try {
      const allowedFields = [
        'name',
        'description',
        'cron_expression',
        'next_run',
        'payload',
        'timeout_seconds',
        'status',
        'retry_count',
        'last_executed_at',
      ];

      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramIndex}`);
          values.push(key === 'payload' ? JSON.stringify(value) : value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(jobId);

      const job = await db.one(
        `UPDATE jobs 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      logger.info('Job updated', { jobId: job.id, updates: Object.keys(updates) });
      return job;
    } catch (error) {
      logger.error('Error updating job:', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete job (soft delete)
   * @param {string} jobId - Job UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(jobId) {
    try {
      await db.none(
        "UPDATE jobs SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [jobId]
      );

      logger.info('Job deleted', { jobId });
      return true;
    } catch (error) {
      logger.error('Error deleting job:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get jobs due for execution (for scheduler)
   * @param {number} minutesAhead - Look ahead minutes (default 5)
   * @returns {Promise<Array>} Jobs due for execution
   */
  static async getDueJobs(minutesAhead = 5) {
    try {
      const jobs = await db.any(
        `SELECT * FROM jobs
         WHERE status = 'active'
           AND next_run <= CURRENT_TIMESTAMP + INTERVAL '${minutesAhead} minutes'
         ORDER BY next_run ASC`,
        []
      );

      return jobs;
    } catch (error) {
      logger.error('Error getting due jobs:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get job with execution statistics
   * @param {string} jobId - Job UUID
   * @returns {Promise<Object>} Job with stats
   */
  static async getWithStats(jobId) {
    try {
      const result = await db.oneOrNone(
        `SELECT 
          j.*,
          jes.total_executions,
          jes.successful_executions,
          jes.failed_executions,
          jes.avg_duration_ms,
          jes.last_execution_time
         FROM jobs j
         LEFT JOIN job_execution_stats jes ON j.id = jes.job_id
         WHERE j.id = $1`,
        [jobId]
      );

      if (!result) {
        return null;
      }

      // Parse statistics
      return {
        ...result,
        statistics: {
          total_executions: parseInt(result.total_executions) || 0,
          successful_executions: parseInt(result.successful_executions) || 0,
          failed_executions: parseInt(result.failed_executions) || 0,
          average_duration_ms: result.avg_duration_ms ? Math.round(result.avg_duration_ms) : null,
          last_execution_time: result.last_execution_time,
        },
      };
    } catch (error) {
      logger.error('Error getting job with stats:', { error: error.message });
      throw error;
    }
  }

  /**
   * Pause job
   * @param {string} jobId - Job UUID
   * @returns {Promise<Object>} Updated job
   */
  static async pause(jobId) {
    try {
      const job = await db.one(
        `UPDATE jobs 
         SET status = 'paused', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId]
      );

      logger.info('Job paused', { jobId });
      return job;
    } catch (error) {
      logger.error('Error pausing job:', { error: error.message });
      throw error;
    }
  }

  /**
   * Resume job
   * @param {string} jobId - Job UUID
   * @param {Date} next_run - Next execution time
   * @returns {Promise<Object>} Updated job
   */
  static async resume(jobId, next_run) {
    try {
      const job = await db.one(
        `UPDATE jobs 
         SET status = 'active', next_run = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId, next_run]
      );

      logger.info('Job resumed', { jobId, next_run });
      return job;
    } catch (error) {
      logger.error('Error resuming job:', { error: error.message });
      throw error;
    }
  }

  /**
   * Update job's next run time
   * @param {string} jobId - Job UUID
   * @param {Date} next_run - Next execution time
   * @returns {Promise<boolean>} Success status
   */
  static async updateNextRun(jobId, next_run) {
    try {
      await db.none(
        'UPDATE jobs SET next_run = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [jobId, next_run]
      );

      logger.debug('Job next_run updated', { jobId, next_run });
      return true;
    } catch (error) {
      logger.error('Error updating next_run:', { error: error.message });
      throw error;
    }
  }

  /**
   * Increment retry count
   * @param {string} jobId - Job UUID
   * @returns {Promise<number>} New retry count
   */
  static async incrementRetryCount(jobId) {
    try {
      const result = await db.one(
        `UPDATE jobs 
         SET retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING retry_count`,
        [jobId]
      );

      return result.retry_count;
    } catch (error) {
      logger.error('Error incrementing retry count:', { error: error.message });
      throw error;
    }
  }

  /**
   * Reset retry count
   * @param {string} jobId - Job UUID
   * @returns {Promise<boolean>} Success status
   */
  static async resetRetryCount(jobId) {
    try {
      await db.none(
        'UPDATE jobs SET retry_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [jobId]
      );

      return true;
    } catch (error) {
      logger.error('Error resetting retry count:', { error: error.message });
      throw error;
    }
  }

  /**
   * Update job's last executed timestamp
   * @param {string} jobId - Job UUID
   * @returns {Promise<Object>} Updated job
   */
  static async updateLastExecuted(jobId) {
    try {
      const job = await db.one(
        `UPDATE jobs 
         SET last_executed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId]
      );

      logger.debug('Job last_executed_at updated', { jobId });
      return job;
    } catch (error) {
      logger.error('Error updating last_executed_at:', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark job as completed
   * @param {string} jobId - Job UUID
   * @returns {Promise<Object>} Updated job
   */
  static async complete(jobId) {
    try {
      const job = await db.one(
        `UPDATE jobs 
         SET status = 'completed', 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId]
      );

      logger.info('Job marked as completed', { jobId });
      return job;
    } catch (error) {
      logger.error('Error marking job as completed:', { error: error.message });
      throw error;
    }
  }







}

module.exports = Job;