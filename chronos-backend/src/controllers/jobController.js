const JobService = require('../services/jobService');
const logger = require('../config/logger');

class JobController {
  /**
   * Create a new job
   * POST /api/jobs
   */
  static async create(req, res, next) {
    try {
      const userId = req.user.id;
      const jobData = req.body;

      const job = await JobService.createJob(userId, jobData);

      res.status(201).json({
        success: true,
        message: 'Job created successfully',
        data: job,
      });
    } catch (error) {
      if (error.message === 'Scheduled time must be in the future') {
        return res.status(400).json({
          error: true,
          message: error.message,
          code: 'INVALID_SCHEDULED_TIME',
        });
      }

      if (error.message === 'Invalid cron expression') {
        return res.status(422).json({
          error: true,
          message: error.message,
          code: 'INVALID_CRON_EXPRESSION',
        });
      }

      next(error);
    }
  }

  /**
   * Get all jobs for user
   * GET /api/jobs
   */
  static async list(req, res, next) {
    try {
      const userId = req.user.id;
      const filters = req.query;

      const result = await JobService.getJobs(userId, filters);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get job by ID
   * GET /api/jobs/:id
   */
  static async getById(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;

      const job = await JobService.getJobById(jobId, userId);

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      next(error);
    }
  }

  /**
   * Update job
   * PATCH /api/jobs/:id
   */
  static async update(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;
      const updates = req.body;

      const job = await JobService.updateJob(jobId, userId, updates);

      res.status(200).json({
        success: true,
        message: 'Job updated successfully',
        data: job,
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (error.message.includes('Cannot update')) {
        return res.status(400).json({
          error: true,
          message: error.message,
          code: 'INVALID_JOB_STATUS',
        });
      }

      if (error.message === 'Invalid cron expression') {
        return res.status(422).json({
          error: true,
          message: error.message,
          code: 'INVALID_CRON_EXPRESSION',
        });
      }

      next(error);
    }
  }

  /**
   * Delete job
   * DELETE /api/jobs/:id
   */
  static async delete(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;

      await JobService.deleteJob(jobId, userId);

      res.status(200).json({
        success: true,
        message: 'Job deleted successfully',
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      next(error);
    }
  }

  /**
   * Pause job
   * POST /api/jobs/:id/pause
   */
  static async pause(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;

      const job = await JobService.pauseJob(jobId, userId);

      res.status(200).json({
        success: true,
        message: 'Job paused successfully',
        data: job,
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (error.message.includes('Only')) {
        return res.status(400).json({
          error: true,
          message: error.message,
          code: 'INVALID_OPERATION',
        });
      }

      next(error);
    }
  }

  /**
   * Resume job
   * POST /api/jobs/:id/resume
   */
  static async resume(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;

      const job = await JobService.resumeJob(jobId, userId);

      res.status(200).json({
        success: true,
        message: 'Job resumed successfully',
        data: job,
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (error.message.includes('Only')) {
        return res.status(400).json({
          error: true,
          message: error.message,
          code: 'INVALID_OPERATION',
        });
      }

      next(error);
    }
  }

  /**
   * Execute job manually
   * POST /api/jobs/:id/execute
   */
  static async execute(req, res, next) {
    try {
      const userId = req.user.id;
      const jobId = req.params.id;

      const result = await JobService.executeJobManually(jobId, userId);

      res.status(202).json({
        success: true,
        message: 'Job execution triggered',
        data: result,
      });
    } catch (error) {
      if (error.message === 'Job not found') {
        return res.status(404).json({
          error: true,
          message: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
      }

      if (error.message.includes('Cannot execute')) {
        return res.status(400).json({
          error: true,
          message: error.message,
          code: 'INVALID_OPERATION',
        });
      }

      next(error);
    }
  }

  /**
   * Get upcoming jobs (next 24 hours)
   * GET /api/jobs/upcoming
   */
  static async upcoming(req, res, next) {
    try {
      const userId = req.user.id;

      const jobs = await JobService.getUpcomingJobs(userId);

      res.status(200).json({
        success: true,
        data: {
          jobs,
          count: jobs.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = JobController;