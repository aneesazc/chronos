const Redis = require('ioredis');
const logger = require('./logger');

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis reconnecting... Attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
};

// Create Redis connection for general use
const redisClient = new Redis(redisConfig);

// Redis event handlers
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('error', (error) => {
  logger.error('Redis client error:', {
    error: error.message,
    code: error.code,
  });
});

redisClient.on('close', () => {
  logger.warn('Redis client connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

// Create separate Redis connection for BullMQ
// BullMQ needs its own connection to avoid blocking issues
const createBullMQConnection = () => {
  return new Redis(redisConfig);
};

// Test Redis connection
const testConnection = async () => {
  try {
    await redisClient.ping();
    logger.info('Redis connection test successful');
    return true;
  } catch (error) {
    logger.error('Redis connection test failed:', {
      error: error.message,
    });
    return false;
  }
};

// Helper functions for common Redis operations

/**
 * Set a value with expiration
 */
const setWithExpiry = async (key, value, expirySeconds) => {
  try {
    await redisClient.setex(key, expirySeconds, value);
    return true;
  } catch (error) {
    logger.error('Redis setWithExpiry error:', { key, error: error.message });
    return false;
  }
};

/**
 * Get a value
 */
const get = async (key) => {
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.error('Redis get error:', { key, error: error.message });
    return null;
  }
};

/**
 * Delete a key
 */
const del = async (key) => {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Redis del error:', { key, error: error.message });
    return false;
  }
};

/**
 * Check if key exists
 */
const exists = async (key) => {
  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Redis exists error:', { key, error: error.message });
    return false;
  }
};

/**
 * Increment counter
 */
const incr = async (key) => {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    logger.error('Redis incr error:', { key, error: error.message });
    return null;
  }
};

/**
 * Set expiration on existing key
 */
const expire = async (key, seconds) => {
  try {
    await redisClient.expire(key, seconds);
    return true;
  } catch (error) {
    logger.error('Redis expire error:', { key, error: error.message });
    return false;
  }
};

/**
 * Add to sorted set
 */
const zadd = async (key, score, member) => {
  try {
    await redisClient.zadd(key, score, member);
    return true;
  } catch (error) {
    logger.error('Redis zadd error:', { key, error: error.message });
    return false;
  }
};

/**
 * Remove from sorted set
 */
const zrem = async (key, member) => {
  try {
    await redisClient.zrem(key, member);
    return true;
  } catch (error) {
    logger.error('Redis zrem error:', { key, error: error.message });
    return false;
  }
};

/**
 * Get sorted set members by score range
 */
const zrangebyscore = async (key, min, max) => {
  try {
    return await redisClient.zrangebyscore(key, min, max);
  } catch (error) {
    logger.error('Redis zrangebyscore error:', { key, error: error.message });
    return [];
  }
};

/**
 * Check if member exists in sorted set
 */
const zscore = async (key, member) => {
  try {
    return await redisClient.zscore(key, member);
  } catch (error) {
    logger.error('Redis zscore error:', { key, error: error.message });
    return null;
  }
};

// Graceful shutdown
const closeConnection = async () => {
  try {
    await redisClient.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

module.exports = {
  redisClient,
  createBullMQConnection,
  testConnection,
  closeConnection,
  // Helper functions
  setWithExpiry,
  get,
  del,
  exists,
  incr,
  expire,
  zadd,
  zrem,
  zrangebyscore,
  zscore,
};