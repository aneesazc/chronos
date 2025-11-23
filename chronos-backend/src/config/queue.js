const { Queue } = require('bullmq');
const { createBullMQConnection } = require('./redis');
const logger = require('./logger');

// Queue names
const QUEUE_NAMES = {
  JOBS: process.env.QUEUE_NAME_JOBS || 'job-execution-queue',
  NOTIFICATIONS: process.env.QUEUE_NAME_NOTIFICATIONS || 'notification-queue',
};

// Create BullMQ connection
const connection = createBullMQConnection();

// Job Execution Queue
const jobQueue = new Queue(QUEUE_NAMES.JOBS, {
  connection,
  defaultJobOptions: {
    attempts: parseInt(process.env.JOB_MAX_RETRIES || '3'),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.JOB_RETRY_DELAY || '60000'), // 1 minute base delay
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 86400, // Remove completed jobs after 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 604800, // Remove failed jobs after 7 days
    },
  },
});

// Notification Queue
const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30 seconds base delay for notifications
    },
    removeOnComplete: {
      count: 50,
      age: 3600, // Remove after 1 hour
    },
    removeOnFail: {
      count: 100,
      age: 86400, // Remove after 24 hours
    },
  },
});

// Queue event listeners
jobQueue.on('error', (error) => {
  logger.error('Job queue error:', {
    queue: QUEUE_NAMES.JOBS,
    error: error.message,
  });
});

notificationQueue.on('error', (error) => {
  logger.error('Notification queue error:', {
    queue: QUEUE_NAMES.NOTIFICATIONS,
    error: error.message,
  });
});

/**
 * Add a job to the execution queue
 * @param {Object} jobData - Job data including jobId, userId, etc.
 * @param {Object} options - BullMQ job options
 * @returns {Promise<Job>} BullMQ job instance
 */
const addJobToQueue = async (jobData, options = {}) => {
  try {
    const job = await jobQueue.add('execute-job', jobData, {
      jobId: jobData.jobId, // Use job UUID as BullMQ job ID for idempotency
      ...options,
    });

    logger.info('Job added to queue', {
      jobId: jobData.jobId,
      bullJobId: job.id,
      delay: options.delay || 0,
    });

    return job;
  } catch (error) {
    logger.error('Error adding job to queue:', {
      jobId: jobData.jobId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Add a notification to the notification queue
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Job>} BullMQ job instance
 */
const addNotificationToQueue = async (notificationData) => {
  try {
    const job = await notificationQueue.add('send-notification', notificationData);

    logger.info('Notification added to queue', {
      type: notificationData.type,
      jobId: notificationData.jobId,
      bullJobId: job.id,
    });

    return job;
  } catch (error) {
    logger.error('Error adding notification to queue:', {
      error: error.message,
    });
    throw error;
  }
};

/**
 * Remove a job from the queue
 * @param {string} jobId - Job UUID
 * @returns {Promise<boolean>}
 */
const removeJobFromQueue = async (jobId) => {
  try {
    // Find the job in BullMQ by our custom jobId
    const job = await jobQueue.getJob(jobId);
    
    if (job) {
      await job.remove();
      logger.info('Job removed from queue', { jobId });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error removing job from queue:', {
      jobId,
      error: error.message,
    });
    return false;
  }
};

/**
 * Get queue metrics
 * @returns {Promise<Object>} Queue statistics
 */
const getQueueMetrics = async () => {
  try {
    const [jobCounts, notificationCounts] = await Promise.all([
      jobQueue.getJobCounts(),
      notificationQueue.getJobCounts(),
    ]);

    return {
      jobs: {
        waiting: jobCounts.waiting || 0,
        active: jobCounts.active || 0,
        completed: jobCounts.completed || 0,
        failed: jobCounts.failed || 0,
        delayed: jobCounts.delayed || 0,
      },
      notifications: {
        waiting: notificationCounts.waiting || 0,
        active: notificationCounts.active || 0,
        completed: notificationCounts.completed || 0,
        failed: notificationCounts.failed || 0,
      },
    };
  } catch (error) {
    logger.error('Error getting queue metrics:', error);
    return null;
  }
};

/**
 * Get waiting jobs count
 * @returns {Promise<number>}
 */
const getQueueDepth = async () => {
  try {
    const counts = await jobQueue.getJobCounts();
    return (counts.waiting || 0) + (counts.delayed || 0);
  } catch (error) {
    logger.error('Error getting queue depth:', error);
    return 0;
  }
};

/**
 * Check if a job exists in the queue
 * @param {string} jobId - Job UUID
 * @returns {Promise<boolean>}
 */
const isJobInQueue = async (jobId) => {
  try {
    const job = await jobQueue.getJob(jobId);
    return job !== undefined;
  } catch (error) {
    logger.error('Error checking if job is in queue:', {
      jobId,
      error: error.message,
    });
    return false;
  }
};

/**
 * Close all queues gracefully
 */
const closeQueues = async () => {
  try {
    await Promise.all([
      jobQueue.close(),
      notificationQueue.close(),
    ]);
    logger.info('All queues closed gracefully');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
};

module.exports = {
  jobQueue,
  notificationQueue,
  QUEUE_NAMES,
  addJobToQueue,
  addNotificationToQueue,
  removeJobFromQueue,
  getQueueMetrics,
  getQueueDepth,
  isJobInQueue,
  closeQueues,
};