#!/usr/bin/env node

/**
 * Phase 4 Test Script
 * 
 * Quick utility to test job creation and execution
 * 
 * Usage:
 *   node src/tests/test-phase4.js
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api/';

// You need to set your JWT token here or pass as environment variable
const JWT_TOKEN = process.env.JWT_TOKEN || 'YOUR_JWT_TOKEN_HERE';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

// Color console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) { log('green', `✅ ${message}`); }
function error(message) { log('red', `❌ ${message}`); }
function info(message) { log('blue', `ℹ️  ${message}`); }
function warn(message) { log('yellow', `⚠️  ${message}`); }

/**
 * Test 1: Create immediate job
 */
async function testImmediateJob() {
    info('Test 1: Creating immediate job...');
    
    try {
        const response = await api.post('/jobs', {
            name: 'Test Immediate Job',
            description: 'Testing immediate execution',
            job_type: 'one-time',
            schedule_type: 'immediate',
            payload: {
                test: true,
                timestamp: new Date().toISOString(),
                message: 'Hello from test script!'
            }
        });

        const job = response.data.data;
        success(`Immediate job created: ${job.id}`);
        info(`  Name: ${job.name}`);
        info(`  Status: ${job.status}`);
        info(`  Next run: ${job.next_run}`);
        
        return job.id;
    } catch (err) {
        error(`Failed to create immediate job: ${err.message}`);
        if (err.response) {
            error(`  Response: ${JSON.stringify(err.response.data)}`);
        }
        throw err;
    }
}

/**
 * Test 2: Create scheduled job (2 minutes from now)
 */
async function testScheduledJob() {
    info('\nTest 2: Creating scheduled job (2 minutes from now)...');
    
    try {
        const scheduledTime = new Date(Date.now() + 2 * 60 * 1000);
        
        const response = await api.post('/jobs', {
            name: 'Test Scheduled Job',
            description: 'Testing scheduled execution',
            job_type: 'one-time',
            schedule_type: 'scheduled',
            scheduled_time: scheduledTime.toISOString(),
            payload: {
                test: true,
                message: 'This job was scheduled!'
            }
        });

        const job = response.data.data;
        success(`Scheduled job created: ${job.id}`);
        info(`  Name: ${job.name}`);
        info(`  Status: ${job.status}`);
        info(`  Scheduled for: ${job.scheduled_time}`);
        info(`  Will execute in 2 minutes at: ${new Date(job.next_run).toLocaleTimeString()}`);
        
        return job.id;
    } catch (err) {
        error(`Failed to create scheduled job: ${err.message}`);
        throw err;
    }
}

/**
 * Test 3: Create recurring job (every 3 minutes)
 */
async function testRecurringJob() {
    info('\nTest 3: Creating recurring job (every 3 minutes)...');
    
    try {
        const response = await api.post('/jobs', {
            name: 'Test Recurring Job',
            description: 'Testing recurring execution',
            job_type: 'recurring',
            schedule_type: 'cron',
            cron_expression: '*/3 * * * *', // Every 3 minutes
            payload: {
                test: true,
                message: 'This is a recurring job!'
            }
        });

        const job = response.data.data;
        success(`Recurring job created: ${job.id}`);
        info(`  Name: ${job.name}`);
        info(`  Status: ${job.status}`);
        info(`  Cron: ${job.cron_expression}`);
        info(`  Next run: ${new Date(job.next_run).toLocaleTimeString()}`);
        warn('  Remember to pause or delete this job when done testing!');
        
        return job.id;
    } catch (err) {
        error(`Failed to create recurring job: ${err.message}`);
        throw err;
    }
}

/**
 * Test 4: Get job details
 */
async function testGetJob(jobId) {
    info(`\nTest 4: Getting job details for ${jobId}...`);
    
    try {
        const response = await api.get(`/jobs/${jobId}`);
        const job = response.data.data;
        
        success('Job details retrieved');
        info(`  Name: ${job.name}`);
        info(`  Status: ${job.status}`);
        info(`  Type: ${job.job_type}`);
        info(`  Created: ${new Date(job.created_at).toLocaleString()}`);
        
        if (job.statistics) {
            info(`  Total executions: ${job.statistics.total_executions}`);
            info(`  Successful: ${job.statistics.successful_executions}`);
            info(`  Failed: ${job.statistics.failed_executions}`);
        }
        
        return job;
    } catch (err) {
        error(`Failed to get job: ${err.message}`);
        throw err;
    }
}

/**
 * Test 5: Manual job execution
 */
async function testManualExecution(jobId) {
    info(`\nTest 5: Manually executing job ${jobId}...`);
    
    try {
        const response = await api.post(`/jobs/${jobId}/execute`);
        const result = response.data.data;
        
        success('Job queued for manual execution');
        info(`  Job ID: ${result.jobId}`);
        info(`  Status: ${result.status}`);
        info(`  Message: ${result.message}`);
        info('  Check worker logs for execution details');
        
        return result;
    } catch (err) {
        error(`Failed to execute job: ${err.message}`);
        throw err;
    }
}

/**
 * Test 6: List user jobs
 */
async function testListJobs() {
    info('\nTest 6: Listing user jobs...');
    
    try {
        const response = await api.get('/jobs?limit=10&page=1');
        const { jobs, pagination } = response.data.data;
        
        success(`Found ${pagination.total} total jobs`);
        info(`  Showing page ${pagination.page} of ${pagination.total_pages}`);
        
        if (jobs.length > 0) {
            info('\n  Recent jobs:');
            jobs.forEach((job, index) => {
                const statusIcon = job.status === 'active' ? '🟢' : 
                                 job.status === 'completed' ? '✅' : 
                                 job.status === 'paused' ? '⏸️' : '⚠️';
                console.log(`    ${index + 1}. ${statusIcon} ${job.name} (${job.status})`);
            });
        }
        
        return jobs;
    } catch (err) {
        error(`Failed to list jobs: ${err.message}`);
        throw err;
    }
}

/**
 * Test 7: Pause and resume job
 */
async function testPauseResume(jobId) {
    info(`\nTest 7: Testing pause/resume for job ${jobId}...`);
    
    try {
        // Pause
        info('  Pausing job...');
        await api.post(`/jobs/${jobId}/pause`);
        success('  Job paused');
        
        // Wait 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Resume
        info('  Resuming job...');
        await api.post(`/jobs/${jobId}/resume`);
        success('  Job resumed');
        
    } catch (err) {
        error(`Failed to pause/resume job: ${err.message}`);
        throw err;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('\n' + '='.repeat(60));
    log('cyan', '🧪 Phase 4 - Scheduler & Workers Test Suite');
    console.log('='.repeat(60) + '\n');

    if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
        error('Please set JWT_TOKEN in .env or in this script!');
        info('Get a token by logging in via POST /api/v1/auth/login');
        process.exit(1);
    }

    info(`API URL: ${API_URL}`);
    info('Make sure the worker is running: npm run worker:dev\n');

    let immediateJobId, scheduledJobId, recurringJobId;

    try {
        // Run tests sequentially
        immediateJobId = await testImmediateJob();
        await new Promise(resolve => setTimeout(resolve, 1000));

        scheduledJobId = await testScheduledJob();
        await new Promise(resolve => setTimeout(resolve, 1000));

        recurringJobId = await testRecurringJob();
        await new Promise(resolve => setTimeout(resolve, 1000));

        await testGetJob(immediateJobId);
        await new Promise(resolve => setTimeout(resolve, 1000));

        await testListJobs();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Manual execution test (on immediate job)
        await testManualExecution(immediateJobId);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Pause/resume test (on recurring job)
        if (recurringJobId) {
            await testPauseResume(recurringJobId);
        }

        console.log('\n' + '='.repeat(60));
        success('All tests completed successfully! 🎉');
        console.log('='.repeat(60) + '\n');

        info('Next steps:');
        console.log('  1. Check worker logs for job execution details');
        console.log('  2. Wait 2 minutes to see the scheduled job execute');
        console.log('  3. Wait 3 minutes to see the recurring job execute');
        console.log('  4. Check database for execution records');
        console.log('\n  Query: SELECT * FROM job_executions ORDER BY started_at DESC LIMIT 10;\n');

        warn(`Don't forget to pause or delete the recurring job!`);
        if (recurringJobId) {
            console.log(`  Pause: curl -X POST ${API_URL}/jobs/${recurringJobId}/pause -H "Authorization: Bearer ${JWT_TOKEN}"`);
            console.log(`  Delete: curl -X DELETE ${API_URL}/jobs/${recurringJobId} -H "Authorization: Bearer ${JWT_TOKEN}"\n`);
        }

    } catch (err) {
        console.log('\n' + '='.repeat(60));
        error('Test suite failed!');
        console.log('='.repeat(60) + '\n');
        
        error(`Error: ${err.message}`);
        
        if (err.code === 'ECONNREFUSED') {
            warn('API server not running?');
            info('Start it with: npm run dev');
        } else if (err.response?.status === 401) {
            warn('JWT token invalid or expired');
            info('Login again to get a new token: POST /api/v1/auth/login');
        }
        
        process.exit(1);
    }
}

// Run the tests
if (require.main === module) {
    runTests();
}

module.exports = { runTests };