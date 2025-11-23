const pgp = require('pg-promise');
const logger = require('./logger');

// PostgreSQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'chronos_db',
  user: process.env.DB_USER || 'chronos_user',
  password: process.env.DB_PASSWORD || 'chronos_password',
  max: parseInt(process.env.DB_POOL_MAX || '10'), // Max pool size
  min: parseInt(process.env.DB_POOL_MIN || '2'),  // Min pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Initialize pg-promise with custom error handling
const initOptions = {
  error(error, e) {
    if (e && e.cn) {
      // A connection-related error
      logger.error('Database connection error:', {
        error: error.message,
        query: e.query || 'N/A',
      });
    }
  },
  query(e) {
    // Log all queries in development
    if (process.env.NODE_ENV === 'development' && e && e.query) {
      logger.debug('SQL Query:', { query: e.query });
    }
  },
  // Remove the receive handler as it's causing issues
  // and isn't critical for functionality
};

// Initialize pg-promise
const pgpInstance = pgp(initOptions);
const db = pgpInstance(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    await db.connect();
    logger.info('PostgreSQL database connected successfully');
    return true;
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL database:', {
      error: error.message,
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
      },
    });
    return false;
  }
};

// Helper function to check if database exists
const checkDatabaseExists = async () => {
  const adminDb = pgpInstance({
    host: dbConfig.host,
    port: dbConfig.port,
    database: 'postgres', // Connect to default postgres database
    user: dbConfig.user,
    password: dbConfig.password,
  });

  try {
    const result = await adminDb.oneOrNone(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbConfig.database]
    );
    return result !== null;
  } catch (error) {
    logger.error('Error checking database existence:', error);
    return false;
  } finally {
    adminDb.$pool.end();
  }
};

module.exports = {
  db,
  pgp: pgpInstance,
  testConnection,
  checkDatabaseExists,
  dbConfig,
};