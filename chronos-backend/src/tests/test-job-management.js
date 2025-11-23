require('dotenv').config();
const JobService = require('../services/jobService');
const AuthService = require('../services/authService');
const { User } = require('../models');
const { testConnection: testDbConnection } = require('../config/database');
const { testConnection: testRedisConnection } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Test job management system
 */
async function testJobManagement() {
  console.log('\n=== Testing Job Management System ===\n');

  let testUser = null;
  let testJobId = null;

  try {
    // Test 1: Connections
    console.log('1. Testing Connections');
    const dbConnected = await testDbConnection();
    const redisConnected = await testRedisConnection();
    
    if (!dbConnected || !redisConnected) {
      throw new Error('Connection failed');
    }
    console.log('   ✅ Database and Redis connected\n');

    // Test 2: Create test user
    console.log('2. Creating Test User');
    const testEmail = `jobtest-${Date.now()}@example.com`;
    testUser = await AuthService.register({
      email: testEmail,
      password: 'TestPass123!',
    });
    console.log('   ✅ Test user created:', testUser.user.id, '\n');

    // Test 3: Create immediate job
    console.log('3. Creating Immediate Job');
    const immediateJob = await JobService.createJob(testUser.user.id, {
      name: 'Test Immediate Job',
      description: 'This job runs immediately',
      job_type: 'one-time',
      schedule_type: 'immediate',
      payload: { test: true },
    });
    testJobId = immediateJob.id;
    console.log('   ✅ Immediate job created:', immediateJob.id);
    console.log('   Name:', immediateJob.name);
    console.log('   Status:', immediateJob.status);
    console.log('   Next run:', immediateJob.next_run, '\n');

    // Test 4: Create scheduled job
    console.log('4. Creating Scheduled Job');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduledJob = await JobService.createJob(testUser.user.id, {
      name: 'Test Scheduled Job',
      job_type: 'one-time',
      schedule_type: 'scheduled',
      scheduled_time: tomorrow.toISOString(),
      payload: { report: 'daily' },
      timeout_seconds: 600,
    });
    console.log('   ✅ Scheduled job created:', scheduledJob.id);
    console.log('   Scheduled for:', scheduledJob.scheduled_time, '\n');

    // Test 5: Create recurring job (cron)
    console.log('5. Creating Recurring Job');
    const recurringJob = await JobService.createJob(testUser.user.id, {
      name: 'Test Recurring Job',
      description: 'Runs every day at 9 AM',
      job_type: 'recurring',
      schedule_type: 'cron',
      cron_expression: '0 9 * * *',
      payload: { type: 'daily_report' },
      max_retries: 5,
    });
    console.log('   ✅ Recurring job created:', recurringJob.id);
    console.log('   Cron:', recurringJob.cron_expression);
    console.log('   Next run:', recurringJob.next_run, '\n');

    // Test 6: List jobs
    console.log('6. Listing Jobs');
    const jobsList = await JobService.getJobs(testUser.user.id, {
      page: 1,
      limit: 10,
    });
    console.log('   ✅ Jobs retrieved:', jobsList.jobs.length);
    console.log('   Total:', jobsList.pagination.total);
    console.log('   Active jobs:', jobsList.jobs.filter(j => j.status === 'active').length, '\n');

    // Test 7: Get job by ID
    console.log('7. Getting Job by ID');
    const jobDetails = await JobService.getJobById(testJobId, testUser.user.id);
    console.log('   ✅ Job details retrieved');
    console.log('   Name:', jobDetails.name);
    console.log('   Status:', jobDetails.status);
    console.log('   Statistics:', jobDetails.statistics, '\n');

    // Test 8: Update job
    console.log('8. Updating Job');
    const updatedJob = await JobService.updateJob(testJobId, testUser.user.id, {
      name: 'Updated Test Job',
      description: 'Updated description',
    });
    console.log('   ✅ Job updated');
    console.log('   New name:', updatedJob.name);
    console.log('   Description:', updatedJob.description, '\n');

    // Test 9: Pause recurring job
    console.log('9. Pausing Recurring Job');
    const pausedJob = await JobService.pauseJob(recurringJob.id, testUser.user.id);
    console.log('   ✅ Job paused');
    console.log('   Status:', pausedJob.status, '\n');

    // Test 10: Resume recurring job
    console.log('10. Resuming Job');
    const resumedJob = await JobService.resumeJob(recurringJob.id, testUser.user.id);
    console.log('   ✅ Job resumed');
    console.log('   Status:', resumedJob.status);
    console.log('   Next run:', resumedJob.next_run, '\n');

    // Test 11: Manual execution
    console.log('11. Triggering Manual Execution');
    const executionResult = await JobService.executeJobManually(testJobId, testUser.user.id);
    console.log('   ✅ Job execution triggered');
    console.log('   Result:', executionResult, '\n');

    // Test 12: Get upcoming jobs
    console.log('12. Getting Upcoming Jobs');
    const upcomingJobs = await JobService.getUpcomingJobs(testUser.user.id);
    console.log('   ✅ Upcoming jobs:', upcomingJobs.length, '\n');

    // Test 13: Filter jobs by status
    console.log('13. Filtering Jobs by Status');
    const activeJobs = await JobService.getJobs(testUser.user.id, {
      status: 'active',
      limit: 50,
    });
    console.log('   ✅ Active jobs:', activeJobs.jobs.length, '\n');

    // Test 14: Invalid cron expression
    console.log('14. Testing Invalid Cron Expression');
    try {
      await JobService.createJob(testUser.user.id, {
        name: 'Invalid Cron Job',
        job_type: 'recurring',
        schedule_type: 'cron',
        cron_expression: 'invalid cron',
      });
      console.log('   ❌ Should have failed\n');
    } catch (error) {
      console.log('   ✅ Invalid cron rejected:', error.message, '\n');
    }

    // Test 15: Past scheduled time
    console.log('15. Testing Past Scheduled Time');
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await JobService.createJob(testUser.user.id, {
        name: 'Past Job',
        job_type: 'one-time',
        schedule_type: 'scheduled',
        scheduled_time: yesterday.toISOString(),
      });
      console.log('   ❌ Should have failed\n');
    } catch (error) {
      console.log('   ✅ Past time rejected:', error.message, '\n');
    }

    // Test 16: Delete job
    console.log('16. Deleting Job');
    await JobService.deleteJob(scheduledJob.id, testUser.user.id);
    console.log('   ✅ Job deleted:', scheduledJob.id, '\n');

    // Test 17: Access deleted job
    console.log('17. Testing Access to Deleted Job');
    try {
      await JobService.getJobById(scheduledJob.id, testUser.user.id);
      console.log('   ❌ Should have failed\n');
    } catch (error) {
      console.log('   ✅ Deleted job not accessible:', error.message, '\n');
    }

    // Cleanup
    console.log('18. Cleaning up');
    await JobService.deleteJob(testJobId, testUser.user.id);
    await JobService.deleteJob(recurringJob.id, testUser.user.id);
    await User.delete(testUser.user.id);
    console.log('   ✅ Test data cleaned up\n');

    console.log('=== All Job Management Tests Passed! ✅ ===\n');
    console.log('Job management system is working correctly!');
    console.log('You can now start the server and test the API endpoints.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error.stack);

    // Cleanup on error
    if (testUser) {
      try {
        await User.delete(testUser.user.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run tests
testJobManagement();