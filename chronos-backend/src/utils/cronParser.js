const { CronExpressionParser } = require('cron-parser');
const logger = require('../config/logger');

/**
 * Validate cron expression
 * @param {string} cronExpression - Cron expression to validate
 * @returns {boolean} True if valid
 */
function isValidCronExpression(cronExpression) {
  try {
    CronExpressionParser.parse(cronExpression, {
      tz: 'UTC',
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get next execution time from cron expression
 * @param {string} cronExpression - Cron expression
 * @param {Date} currentDate - Current date (optional)
 * @returns {Date} Next execution time
 */
function getNextRun(cronExpression, currentDate = new Date()) {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate,
      tz: 'UTC',
    });
    return interval.next().toDate();
  } catch (error) {
    logger.error('Error parsing cron expression:', {
      cronExpression,
      error: error.message,
    });
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
}

/**
 * Get next N execution times from cron expression
 * @param {string} cronExpression - Cron expression
 * @param {number} count - Number of next runs to get
 * @param {Date} currentDate - Current date (optional)
 * @returns {Array<Date>} Array of next execution times
 */
function getNextNRuns(cronExpression, count = 5, currentDate = new Date()) {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate,
      tz: 'UTC',
    });

    const nextRuns = interval.take(count).map((date) => date.toDate());
    return nextRuns;
  } catch (error) {
    logger.error('Error getting next runs:', {
      cronExpression,
      error: error.message,
    });
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }
}

/**
 * Get human-readable description of cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {string} Human-readable description
 */
function describeCronExpression(cronExpression) {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: 'UTC',
    });

    // Get next 2 occurrences to better understand the pattern
    const nextDates = interval.take(2).map((date) => date.toString());

    return `Next run: ${nextDates[0]}, then ${nextDates[1]}`;
  } catch (error) {
    return 'Invalid cron expression';
  }
}

/**
 * Calculate delay in milliseconds until next run
 * @param {string} cronExpression - Cron expression
 * @param {Date} currentDate - Current date (optional, defaults to now)
 * @returns {number} Delay in milliseconds
 */
function getDelayUntilNextRun(cronExpression, currentDate = new Date()) {
  try {
    const nextRun = getNextRun(cronExpression, currentDate);
    const delay = nextRun.getTime() - currentDate.getTime();
    return Math.max(0, delay);
  } catch (error) {
    logger.error('Error calculating delay:', {
      cronExpression,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Common cron expression patterns
 */
const COMMON_PATTERNS = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY_MIDNIGHT: '0 0 * * *',
  EVERY_DAY_NOON: '0 12 * * *',
  EVERY_MONDAY: '0 0 * * 1',
  EVERY_WEEKDAY: '0 9 * * 1-5',
  EVERY_WEEKEND: '0 9 * * 0,6',
  FIRST_DAY_OF_MONTH: '0 0 1 * *',
  LAST_DAY_OF_MONTH: '0 0 L * *',
};

/**
 * Get common pattern description
 * @param {string} pattern - Cron pattern
 * @returns {string} Description
 */
function getPatternDescription(pattern) {
  const descriptions = {
    [COMMON_PATTERNS.EVERY_MINUTE]: 'Every minute',
    [COMMON_PATTERNS.EVERY_5_MINUTES]: 'Every 5 minutes',
    [COMMON_PATTERNS.EVERY_15_MINUTES]: 'Every 15 minutes',
    [COMMON_PATTERNS.EVERY_30_MINUTES]: 'Every 30 minutes',
    [COMMON_PATTERNS.EVERY_HOUR]: 'Every hour',
    [COMMON_PATTERNS.EVERY_DAY_MIDNIGHT]: 'Every day at midnight',
    [COMMON_PATTERNS.EVERY_DAY_NOON]: 'Every day at noon',
    [COMMON_PATTERNS.EVERY_MONDAY]: 'Every Monday at midnight',
    [COMMON_PATTERNS.EVERY_WEEKDAY]: 'Every weekday at 9 AM',
    [COMMON_PATTERNS.EVERY_WEEKEND]: 'Every weekend at 9 AM',
    [COMMON_PATTERNS.FIRST_DAY_OF_MONTH]: 'First day of every month at midnight',
  };

  return descriptions[pattern] || 'Custom schedule';
}

/**
 * Validate and normalize cron expression
 * @param {string} cronExpression - Cron expression
 * @returns {Object} { valid: boolean, normalized: string, error: string }
 */
function validateAndNormalize(cronExpression) {
  try {
    // Trim whitespace
    const trimmed = cronExpression.trim();

    // Try to parse with UTC timezone
    CronExpressionParser.parse(trimmed, {
      tz: 'UTC',
    });

    return {
      valid: true,
      normalized: trimmed,
      error: null,
    };
  } catch (error) {
    return {
      valid: false,
      normalized: null,
      error: error.message,
    };
  }
}

module.exports = {
  isValidCronExpression,
  getNextRun,
  getNextNRuns,
  describeCronExpression,
  getDelayUntilNextRun,
  validateAndNormalize,
  getPatternDescription,
  COMMON_PATTERNS,
};