/**
 * Clean Bull Queue Utility
 * 
 * This script cleans up old/stale jobs from Bull queues
 * Run this when you have jobs in the queue that no longer exist in the database
 * 
 * Usage:
 *   node src/utils/cleanQueue.js
 */

require('dotenv').config();
const { jobQueue, notificationQueue } = require('../config/queue');
const logger = require('../config/logger');

async function cleanQueues() {
    try {
        console.log('🧹 Starting queue cleanup...\n');

        // Clean job queue
        console.log('Cleaning job-execution-queue...');

        // Remove all failed jobs
        const failedJobs = await jobQueue.clean(0, 0, 'failed');
        console.log(`✅ Removed ${failedJobs.length} failed jobs`);

        // Remove all completed jobs
        const completedJobs = await jobQueue.clean(0, 0, 'completed');
        console.log(`✅ Removed ${completedJobs.length} completed jobs`);

        // Remove waiting jobs (optional - be careful with this)
        // const waitingJobs = await jobQueue.clean(0, 0, 'wait');
        // console.log(`✅ Removed ${waitingJobs.length} waiting jobs`);

        // Remove delayed jobs (optional - be careful with this)
        // const delayedJobs = await jobQueue.clean(0, 0, 'delayed');
        // console.log(`✅ Removed ${delayedJobs.length} delayed jobs`);

        // Clean notification queue
        console.log('\nCleaning notification-queue...');

        const notifFailed = await notificationQueue.clean(0, 0, 'failed');
        console.log(`✅ Removed ${notifFailed.length} failed notifications`);

        const notifCompleted = await notificationQueue.clean(0, 0, 'completed');
        console.log(`✅ Removed ${notifCompleted.length} completed notifications`);

        // Get queue counts after cleanup
        console.log('\n📊 Queue status after cleanup:');

        const jobCounts = await jobQueue.getJobCounts();
        console.log('Job Queue:', {
            waiting: jobCounts.waiting,
            active: jobCounts.active,
            completed: jobCounts.completed,
            failed: jobCounts.failed,
            delayed: jobCounts.delayed,
        });

        const notifCounts = await notificationQueue.getJobCounts();
        console.log('Notification Queue:', {
            waiting: notifCounts.waiting,
            active: notifCounts.active,
            completed: notifCounts.completed,
            failed: notifCounts.failed,
        });

        console.log('\n✅ Queue cleanup completed!');

        await jobQueue.close();
        await notificationQueue.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error cleaning queues:', error);
        process.exit(1);
    }
}

// Run cleanup
cleanQueues();