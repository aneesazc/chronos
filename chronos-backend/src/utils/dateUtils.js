/**
 * Calculate delay in milliseconds from now to target date
 * @param {Date|string} targetDate - Target date
 * @returns {number} Delay in milliseconds (0 if target is in the past)
 */
function calculateDelay(targetDate) {
  const target = new Date(targetDate);
  const now = new Date();
  const delay = target.getTime() - now.getTime();
  return Math.max(0, delay);
}

/**
 * Check if a date is in the past
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the past
 */
function isInPast(date) {
  return new Date(date) < new Date();
}

/**
 * Check if a date is in the future
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the future
 */
function isInFuture(date) {
  return new Date(date) > new Date();
}

/**
 * Add minutes to a date
 * @param {Date} date - Base date
 * @param {number} minutes - Minutes to add
 * @returns {Date} New date
 */
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Add hours to a date
 * @param {Date} date - Base date
 * @param {number} hours - Hours to add
 * @returns {Date} New date
 */
function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

/**
 * Add days to a date
 * @param {Date} date - Base date
 * @param {number} days - Days to add
 * @returns {Date} New date
 */
function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const d = new Date(date);
  return d.toISOString();
}

/**
 * Format date for human-readable display
 * @param {Date|string} date - Date to format
 * @returns {string} Human-readable date string
 */
function formatDateHuman(date) {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Get time difference in human-readable format
 * @param {Date|string} date - Date to compare with now
 * @returns {string} Human-readable time difference
 */
function getTimeDifference(date) {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Get relative time string (e.g., "in 5 minutes", "2 hours ago")
 * @param {Date|string} date - Date to compare with now
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  const target = new Date(date);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const isPast = diffMs < 0;
  const timeDiff = getTimeDifference(date);

  return isPast ? `${timeDiff} ago` : `in ${timeDiff}`;
}

/**
 * Check if date is within a certain range from now
 * @param {Date|string} date - Date to check
 * @param {number} minutes - Range in minutes
 * @returns {boolean} True if within range
 */
function isWithinMinutes(date, minutes) {
  const target = new Date(date);
  const now = new Date();
  const future = addMinutes(now, minutes);
  return target >= now && target <= future;
}

/**
 * Parse ISO date string safely
 * @param {string} dateString - ISO date string
 * @returns {Date|null} Date object or null if invalid
 */
function parseISODate(dateString) {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * Get start of day (midnight)
 * @param {Date} date - Date
 * @returns {Date} Start of day
 */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day (23:59:59.999)
 * @param {Date} date - Date
 * @returns {Date} End of day
 */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Convert milliseconds to human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} Human-readable duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s` 
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 
    ? `${hours}h ${remainingMinutes}m` 
    : `${hours}h`;
}

/**
 * Get current UTC timestamp
 * @returns {Date} Current UTC date
 */
function getCurrentUTC() {
  return new Date();
}

/**
 * Convert local date to UTC
 * @param {Date} date - Local date
 * @returns {Date} UTC date
 */
function toUTC(date) {
  return new Date(date.toUTCString());
}

module.exports = {
  calculateDelay,
  isInPast,
  isInFuture,
  addMinutes,
  addHours,
  addDays,
  formatDate,
  formatDateHuman,
  getTimeDifference,
  getRelativeTime,
  isWithinMinutes,
  parseISODate,
  startOfDay,
  endOfDay,
  formatDuration,
  getCurrentUTC,
  toUTC,
};