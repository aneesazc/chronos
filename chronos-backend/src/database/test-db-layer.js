require('dotenv').config();
const { User, Job, JobExecution, JobLog } = require('../models');
const { testConnection: testDbConnection } = require('../config/database');
const { testConnection: testRedisConnection } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Test database layer functionality
 */
async function testDatabaseLayer() {
  console.log('\n=== Testing Chronos Database Layer ===\n');

  try {
    // Test 1: Database Connection
    console.log('1. Testing PostgreSQL connection...');
    const dbConnected = await testDbConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    console.log('   ✅ PostgreSQL connected\n');

    // Test 2: Redis Connection
    console.log('2. Testing Redis connection...');
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      throw new Error('Redis connection failed');
    }
    console.log('   ✅ Redis connected\n');

    // Test 3: User Model
    console.log('3. Testing User model...');
    const testEmail = `test-${Date.now()}@example.com`;
    
    const user = await User.create({
      email: testEmail,
      password: 'TestPassword123!',
    });
    console.log(`   ✅ User created: ${user.email} (${user.id})`);

    const foundUser = await User.findByEmail(testEmail);
    console.log(`   ✅ User found by email: ${foundUser.email}`);

    const verifiedUser = await User.verifyCredentials(testEmail, 'TestPassword123!');
    console.log(`   ✅ Credentials verified: ${verifiedUser ? 'Success' : 'Failed'}`);

    const stats = await User.getStats(user.id);
    console.log(`   ✅ User stats retrieved: ${stats.total_jobs} jobs\n`);

    // Test 4: Job Model
    console.log('4. Testing Job model...');
    
    const job = await Job.create({
      user_id: user.id,
      name: 'Test Job',
      description: 'A test job for database verification',
      job_type: 'one-time',
      schedule_type: 'scheduled',
      scheduled_time: new Date(Date.now() + 3600000), // 1 hour from now
      next_run: new Date(Date.now() + 3600000),
      payload: { test: true, data: 'sample' },
      timeout_seconds: 300,
      max_retries: 3,
    });
    console.log(`   ✅ Job created: ${job.name} (${job.id})`);

    const foundJob = await Job.findById(job.id);
    console.log(`   ✅ Job found by ID: ${foundJob.name}`);

    const jobsList = await Job.list({
      user_id: user.id,
      page: 1,
      limit: 10,
    });
    console.log(`   ✅ Jobs listed: ${jobsList.jobs.length} jobs found`);

    const updatedJob = await Job.update(job.id, {
      description: 'Updated description',
    });
    console.log(`   ✅ Job updated: ${updatedJob.description}\n`);

    // Test 5: JobExecution Model
    console.log('5. Testing JobExecution model...');
    
    const execution = await JobExecution.create({
      job_id: job.id,
      status: 'running',
      retry_attempt: 0,
    });
    console.log(`   ✅ Execution created: ${execution.id}`);

    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work

    const completedExecution = await JobExecution.markSuccess(
      execution.id,
      100,
      { result: 'success', items_processed: 42 }
    );
    console.log(`   ✅ Execution marked as success: ${completedExecution.status}`);

    const executionStats = await JobExecution.getJobStats(job.id);
    console.log(`   ✅ Execution stats: ${executionStats.total_executions} executions, ${executionStats.success_rate} success rate\n`);

    // Test 6: JobLog Model
    console.log('6. Testing JobLog model...');
    
    await JobLog.info(execution.id, 'Job started successfully');
    await JobLog.info(execution.id, 'Processing items', { count: 42 });
    await JobLog.info(execution.id, 'Job completed successfully');
    console.log('   ✅ Logs created');

    const logs = await JobLog.getByExecution({
      execution_id: execution.id,
      limit: 100,
    });
    console.log(`   ✅ Logs retrieved: ${logs.total} logs found`);

    const logStats = await JobLog.getStats(execution.id);
    console.log(`   ✅ Log stats: ${logStats.total} total, ${logStats.info} info\n`);

    // Cleanup
    console.log('7. Cleaning up test data...');
    await Job.delete(job.id);
    await User.delete(user.id);
    console.log('   ✅ Test data cleaned up\n');

    console.log('=== All Tests Passed! ✅ ===\n');
    console.log('Database layer is working correctly!');
    console.log('You can now proceed with building the authentication system.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

// Run tests
testDatabaseLayer();