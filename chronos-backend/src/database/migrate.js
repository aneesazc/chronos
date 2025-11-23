require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { db, testConnection } = require('../config/database');
const logger = require('../config/logger');

/**
 * Run database migrations
 */
async function runMigrations() {
  try {
    logger.info('Starting database migration...');

    // Test database connection
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    // Read and execute schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');

    logger.info('Executing schema migration...');
    await db.none(schemaSQL);

    logger.info('✅ Database migration completed successfully');
    logger.info('Tables created:');
    logger.info('  - users');
    logger.info('  - jobs');
    logger.info('  - job_executions (with 4 monthly partitions)');
    logger.info('  - job_logs (with 4 monthly partitions)');
    logger.info('Views created:');
    logger.info('  - jobs_due_for_execution');
    logger.info('  - job_execution_stats');

    // Verify tables were created
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    logger.info('Verified tables in database:');
    tables.forEach(table => {
      logger.info(`  ✓ ${table.table_name}`);
    });

    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

/**
 * Drop all tables (for development reset)
 */
async function dropAllTables() {
  try {
    logger.warn('Dropping all tables...');

    await db.none(`
      -- Drop views first
      DROP VIEW IF EXISTS jobs_due_for_execution CASCADE;
      DROP VIEW IF EXISTS job_execution_stats CASCADE;
      
      -- Drop tables in reverse order of dependencies
      DROP TABLE IF EXISTS job_logs CASCADE;
      DROP TABLE IF EXISTS job_executions CASCADE;
      DROP TABLE IF EXISTS jobs CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      
      -- Drop functions
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    `);

    logger.info('✅ All tables dropped successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to drop tables:', {
      error: error.message,
    });
    process.exit(1);
  }
}

/**
 * Reset database (drop and recreate)
 */
async function resetDatabase() {
  try {
    logger.warn('Resetting database...');
    
    // Drop all tables
    await db.none(`
      DROP VIEW IF EXISTS jobs_due_for_execution CASCADE;
      DROP VIEW IF EXISTS job_execution_stats CASCADE;
      DROP TABLE IF EXISTS job_logs CASCADE;
      DROP TABLE IF EXISTS job_executions CASCADE;
      DROP TABLE IF EXISTS jobs CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    `);

    logger.info('Dropped all existing tables');

    // Run migrations
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');
    await db.none(schemaSQL);

    logger.info('✅ Database reset completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Database reset failed:', {
      error: error.message,
    });
    process.exit(1);
  }
}

/**
 * Check database status
 */
async function checkStatus() {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      logger.error('❌ Database connection failed');
      process.exit(1);
    }

    // Check tables
    const tables = await db.any(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    logger.info('Database Status:');
    logger.info(`Connected: ✓`);
    logger.info(`Tables: ${tables.length}`);
    
    for (const table of tables) {
      logger.info(`  - ${table.table_name} (${table.column_count} columns)`);
    }

    // Check views
    const views = await db.any(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (views.length > 0) {
      logger.info(`Views: ${views.length}`);
      views.forEach(view => {
        logger.info(`  - ${view.table_name}`);
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error('Status check failed:', {
      error: error.message,
    });
    process.exit(1);
  }
}

// Parse command line arguments
const command = process.argv[2];

switch (command) {
  case 'up':
  case 'migrate':
    runMigrations();
    break;
  case 'down':
  case 'drop':
    dropAllTables();
    break;
  case 'reset':
    resetDatabase();
    break;
  case 'status':
    checkStatus();
    break;
  default:
    console.log(`
Chronos Database Migration Tool

Usage: node migrate.js [command]

Commands:
  up, migrate    Run migrations (create all tables)
  down, drop     Drop all tables
  reset          Drop and recreate all tables
  status         Check database connection and tables

Examples:
  npm run migrate           # Run migrations
  node migrate.js reset     # Reset database
  node migrate.js status    # Check status
    `);
    process.exit(0);
}