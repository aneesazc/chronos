# Chronos Job Scheduler - Backend API

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Express](https://img.shields.io/badge/Express-4.x-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)
![Redis](https://img.shields.io/badge/Redis-7+-red.svg)
![BullMQ](https://img.shields.io/badge/BullMQ-5.x-orange.svg)

A production-ready, distributed job scheduling system built with Node.js, PostgreSQL, Redis, and BullMQ.

[Features](#-features) • [Architecture](#-architecture) • [Installation](#-installation) • [API Documentation](#-api-documentation)

</div>

---

## Overview

**Chronos** is a robust, scalable backend system for scheduling and executing jobs at specified times or intervals. It supports one-time and recurring jobs with cron-based scheduling, automatic retries with exponential backoff, comprehensive logging, and email notifications.

### Key Capabilities

- ✅ **Job Scheduling**: Immediate, scheduled, and recurring (cron-based) jobs
- ✅ **Scalability**: Horizontal scaling with stateless API and multiple workers
- ✅ **Reliability**: Exponential backoff retries and safety sync mechanism
- ✅ **Monitoring**: Comprehensive logging and execution history
- ✅ **Authentication**: JWT-based authentication with rate limiting
- ✅ **Notifications**: Email notifications for job failures

---

## 🎯 Features

### Core Features

| Feature | Description |
|---------|-------------|
| **One-time Jobs** | Execute jobs immediately or at a specific future time |
| **Recurring Jobs** | Schedule jobs using cron expressions (hourly, daily, weekly, etc.) |
| **Job Management** | Create, update, pause, resume, delete, and manually trigger jobs |
| **Execution History** | Track all job executions with detailed logs |
| **Automatic Retries** | Exponential backoff retry mechanism (configurable) |
| **Email Notifications** | Notify users when jobs fail after all retries |
| **Rate Limiting** | 100 requests/hour per user (configurable) |
| **Safety Sync** | Every 5 minutes, checks PostgreSQL for missed jobs |

### Technical Features

- **Stateless API**: Easy horizontal scaling
- **Queue-based Execution**: BullMQ for high-performance job processing
- **Connection Pooling**: Optimized database connections
- **Partitioned Tables**: Monthly partitions for job_executions and job_logs
- **Graceful Shutdown**: Proper cleanup of connections and workers
- **Comprehensive Error Handling**: Structured error responses
- **Request Validation**: Zod-based schema validation
- **Security**: Helmet.js, CORS, JWT authentication, password hashing

---

## 🛠 Tech Stack

### Core Technologies

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 15+ (with pg-promise)
- **Cache/Queue**: Redis 7+ & BullMQ 5.x
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Zod 4.x
- **Logging**: Winston 3.x
- **Email**: NodeMailer 7.x
- **Scheduling**: cron-parser 5.x

### Development Tools

- **Environment**: dotenv
- **Process Manager**: Docker Compose
- **Code Quality**: ESLint

---

## 🏗 Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                       Load Balancer                          │
│                    (Nginx / AWS ALB)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐       ┌───────▼────────┐
│  API Server 1  │       │  API Server 2  │  (Stateless - Horizontal Scaling)
└───────┬────────┘       └───────┬────────┘
        │                         │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐       ┌───────▼────────┐
│  PostgreSQL    │       │     Redis      │
│  (Source of    │       │  (BullMQ Queue │
│   Truth)       │       │   & Cache)     │
└────────────────┘       └───────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
            ┌───────▼────────┐       ┌───────▼────────┐
            │   Worker 1     │       │   Worker 2     │  (Scalable Workers)
            │  (5 concurrent)│       │  (5 concurrent)│
            └────────────────┘       └────────────────┘
```

### Core Components

#### **API Gateway (Express.js)**
- **Purpose:** RESTful API server handling all client requests
- **Features:**
  - JWT-based authentication (24-hour token expiration)
  - Zod request validation (type-safe schema validation)
  - Rate limiting: 100 requests/hour per user (Redis-backed)
  - CORS support for web clients
  - Centralized error handling
- **Scalability:** Stateless design enables horizontal scaling behind load balancer
- **Port:** 5000 (configurable)

---

#### **Job Scheduler Service**
- **Purpose:** Ensures reliable job scheduling and execution timing
- **How It Works:**
  1. **Job Creation:** When job is created, calculate delay = `next_run - now()`
  2. **Queue Addition:** Add to Bull's delayed queue with calculated delay
  3. **Automatic Triggering:** Bull automatically makes job available at scheduled time (no polling!)
  4. **Safety Sync:** Every 5 minutes, queries PostgreSQL for jobs where `next_run <= NOW()` and `status = 'active'`
  5. **Recovery:** Adds any missed jobs to queue (handles Redis crashes, worker downtime)
  6. **Recurring Jobs:** After execution, calculates next run time using cron-parser, updates PostgreSQL, re-queues
- **Process:** Runs as separate Node.js process with `setInterval`
- **Why This Approach:**
  - ✅ No constant database polling (efficient)
  - ✅ Millisecond-precision scheduling
  - ✅ PostgreSQL remains source of truth (reliability)
  - ✅ Bull handles queue complexity (retry, backoff, priority)

---

#### **Job Executor Service (Workers)**
- **Purpose:** Execute queued jobs and manage their lifecycle
- **Process Flow:**
  1. Worker pulls job from Bull queue
  2. Fetches full job details from PostgreSQL
  3. Marks job as "running" in Redis (active jobs tracking)
  4. Creates execution record in `job_executions` table
  5. Executes job logic with timeout protection (default: 5 minutes)
  6. On success: Updates execution record, logs, and if recurring → reschedules
  7. On failure: Updates with error, Bull auto-retries with exponential backoff
  8. Cleanup: Removes from active jobs, Bull handles queue removal
- **Concurrency:** Each worker processes 5 jobs simultaneously (configurable via `WORKER_CONCURRENCY`)
- **Scalability:** 
  - Vertical: Increase concurrency per worker (5 → 10 → 20)
  - Horizontal: Add worker processes on multiple servers
  - Example: 3 servers × 5 concurrency = 15 jobs executing simultaneously
- **Process:** Separate Node.js process, can run on different machines

---

#### **Retry Manager**
- **Purpose:** Handle transient failures with intelligent retry strategy
- **Implementation:** Bull's built-in retry mechanism
- **Retry Schedule (Exponential Backoff):**
  - Attempt 1 fails → Wait 1 minute (60000ms × 2^0)
  - Attempt 2 fails → Wait ~5 minutes (60000ms × 2^1)
  - Attempt 3 fails → Wait ~15 minutes (60000ms × 2^2)
  - After 3 failures → Add to notification queue, mark job as permanently failed
- **Configuration:** `max_retries: 3`, `backoff: { type: 'exponential', delay: 60000 }`
- **Why Exponential Backoff:** Gives temporary issues (DB overload, network) time to recover without hammering the system

---

#### **Notification Service**
- **Purpose:** Send async email notifications without blocking job execution
- **Technology:** NodeMailer with SMTP (Gmail, SendGrid, etc.)
- **Process:**
  1. Job fails after all retries
  2. Worker adds notification to `notification-queue`
  3. Notification worker picks up notification
  4. Fetches user email from PostgreSQL
  5. Sends formatted email via SMTP
  6. Logs notification in `job_logs`
- **Why Separate Queue:** Email sending is slow (2-5 seconds), shouldn't block job execution
- **Email Types:** Job failure alerts, timeout notifications, system alerts

---

### Technology Stack

#### **Primary Database: PostgreSQL 15+**

**Why PostgreSQL over MongoDB/NoSQL?**

| Need | PostgreSQL | MongoDB |
|------|-----------|---------|
| **ACID Transactions** | ✅ Full compliance | ⚠️ Limited to single document |
| **Job State Changes** | ✅ Atomic updates, no race conditions | ⚠️ Potential consistency issues |
| **Complex Queries** | ✅ JOINs (jobs → executions → logs) | ❌ Requires aggregation pipelines |
| **Time-based Scheduling** | ✅ Excellent timestamp indexing | ✅ Good but less optimized |
| **Schema + Flexibility** | ✅ JSONB for flexible fields | ✅ Native JSON |
| **Query Power** | ✅ Full SQL (subqueries, CTEs, window functions) | ⚠️ Limited operators |

**Our Tables:**
- `users`: User accounts and authentication
- `jobs`: Job definitions, scheduling info, configuration
- `job_executions`: Historical record of every execution (partitioned by month)
- `job_logs`: Detailed logs for debugging (partitioned by month)

**Key Features We Use:**
- **JSONB:** Job `payload` field stores arbitrary parameters without schema changes
- **Partitioning:** Monthly partitions keep recent data fast as history grows
- **Indexes:** Strategic indexes on `next_run`, `user_id`, `status` for fast queries
- **Foreign Keys:** Cascade deletes maintain referential integrity

---

#### **Cache & Queue: Redis 7+ & Bull 5.x**

**Why Redis?**
- ⚡ In-memory speed (<1ms latency)
- 🔄 Multiple use cases (cache, queue, counters, pub/sub)
- 💾 Persistence options (AOF/RDB) for reliability
- 🎯 Perfect foundation for Bull queue system
- 📊 Built-in TTL for automatic data expiration

**Our Redis Usage:**
1. **Session Management:**
   - `session:blacklist:{token}` - Invalidated JWT tokens (TTL: 24 hours)
   
2. **Rate Limiting:**
   - `ratelimit:{userId}:{window}` - Request counters (TTL: 1 hour)
   - Fast increment + auto-expiration
   
3. **Active Jobs Tracking:**
   - `active:jobs` - Sorted set of currently executing jobs
   - Score = start timestamp (detect stuck jobs)

**Decision:** Bull wins for job scheduling because it's purpose-built, uses existing infrastructure, and has built-in retry logic.

**Bull Queues We Use:**
- `job-execution-queue` - Main job processing queue
- `notification-queue` - Email notifications
- Automatic management of delayed, active, completed, and failed jobs

---

### Scalability Design

#### **Horizontal Scaling Strategy**

```
          LOAD BALANCER (Nginx)
                  ↓
    ┌─────────────┼─────────────┐
    ↓             ↓             ↓
API Server 1  API Server 2  API Server 3  (Add more as needed)
    ↓             ↓             ↓
    └─────────────┼─────────────┘
                  ↓
    ┌─────────────┴─────────────┐
    ↓                           ↓
PostgreSQL                   Redis Cluster
(Primary + Read Replicas)    (Multiple masters)
    ↓                           ↓
    └─────────────┬─────────────┘
                  ↓
    ┌─────────────┼─────────────┐
    ↓             ↓             ↓
Worker Pool 1  Worker Pool 2  Worker Pool 3  (Add more as needed)
```

**Scaling Dimensions:**

1. **API Servers (Stateless):**
   - Current: 1 server
   - Scale to: N servers behind load balancer
   - How: All servers share same PostgreSQL and Redis
   - When: CPU > 70%, response time > 500ms, request queue > 100

2. **Workers:**
   - Vertical: Increase `WORKER_CONCURRENCY` (5 → 10 → 20)
   - Horizontal: Add worker processes on more servers
   - How: All workers compete for jobs from shared Bull queue
   - When: Queue depth > 100, average wait time > 2 minutes, worker CPU > 80%

3. **Database:**
   - Primary: All writes (job creation, status updates)
   - Read Replicas: Dashboard queries, execution history, analytics
   - When: Connection pool exhaustion, query time > 100ms

4. **Redis:**
   - Single instance → Redis Cluster with sharding
   - Redis Sentinel for automatic failover
   - Separate instances for different purposes (queues, cache, rate limiting)

**Scaling Triggers:**

| Metric | Threshold | Action |
|--------|-----------|--------|
| API CPU Usage | >70% | Add API server |
| API Response Time | >500ms | Add API server |
| Queue Depth | >100 jobs waiting | Add workers |
| Average Job Wait | >2 minutes | Increase worker concurrency |
| Worker CPU | >80% | Add worker server |
| DB Connections | >80% of pool | Add read replica or increase pool |
| DB Query Time | >100ms | Add indexes or read replica |

---

#### **Performance Optimizations**

**Database Level:**
```sql
-- Critical indexes for fast queries
CREATE INDEX idx_jobs_next_run ON jobs(next_run) WHERE status = 'active';  -- Scheduler queries
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);  -- User dashboard
CREATE INDEX idx_job_executions_job_id ON job_executions(job_id);  -- Execution history

-- Connection pooling
DB_POOL_MIN=2    # Development
DB_POOL_MAX=10   # Development
DB_POOL_MAX=50   # Production (increase based on load)

-- Table partitioning (monthly)
-- Keeps recent executions fast, old data can be archived
CREATE TABLE job_executions_2025_11 PARTITION OF job_executions
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

**Query Optimization:**
```sql
-- Use database views for complex repeated queries
CREATE VIEW job_execution_stats AS
SELECT 
  job_id,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  AVG(duration_ms) as avg_duration
FROM job_executions
GROUP BY job_id;
```

---

## 2. Data Architecture

### PostgreSQL Schema

#### **users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt with 10 salt rounds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);  -- Fast login queries
```

**Purpose:** User authentication and job ownership

---

#### **jobs**
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Job metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Job type and scheduling
  job_type VARCHAR(20) NOT NULL,  -- 'one-time' or 'recurring'
  schedule_type VARCHAR(20) NOT NULL,  -- 'immediate', 'scheduled', or 'cron'
  scheduled_time TIMESTAMP WITH TIME ZONE NULL,  -- For 'scheduled' type
  cron_expression VARCHAR(100) NULL,  -- For 'cron' type (e.g., '0 9 * * 1')
  next_run TIMESTAMP WITH TIME ZONE NOT NULL,  -- 🔑 CRITICAL: When to execute next
  
  -- Job configuration
  payload JSONB NOT NULL DEFAULT '{}',  -- Flexible parameters (any JSON)
  timeout_seconds INTEGER DEFAULT 300,  -- Max execution time (5 min default)
  
  -- Status and retry
  status VARCHAR(20) DEFAULT 'pending',  -- pending|active|paused|completed|failed|deleted
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_executed_at TIMESTAMP WITH TIME ZONE NULL
);

-- CRITICAL INDEXES
CREATE INDEX idx_jobs_next_run ON jobs(next_run) WHERE status = 'active';  -- Scheduler
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);  -- User queries
CREATE INDEX idx_jobs_active_recurring ON jobs(next_run) 
  WHERE status = 'active' AND job_type = 'recurring';  -- Recurring job optimization
```

**Purpose:** Job definitions, scheduling configuration, and state management

**Key Design Decisions:**
- `next_run` is the most critical field (indexed, used by scheduler)
- `payload` is JSONB for maximum flexibility without schema changes
- `status` controls job lifecycle (pending → active → completed/failed)
- Foreign key CASCADE ensures cleanup when user is deleted

---

#### **job_executions** (Partitioned)
```sql
CREATE TABLE job_executions (
  id UUID DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  
  -- Execution details
  execution_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL,  -- 'running', 'success', 'failed', 'timeout'
  retry_attempt INTEGER DEFAULT 0,
  duration_ms INTEGER,  -- How long execution took
  
  -- Results and errors
  error_message TEXT NULL,  -- Error details if failed
  output JSONB NULL,  -- Job results/output (flexible structure)
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (id, execution_time)
) PARTITION BY RANGE (execution_time);

-- Monthly partitions (create new ones each month)
CREATE TABLE job_executions_2025_11 PARTITION OF job_executions
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE job_executions_2025_12 PARTITION OF job_executions
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Indexes on partitioned table
CREATE INDEX idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX idx_job_executions_status ON job_executions(status);
```

**Purpose:** Complete history of all job executions

**Why Partitioned?**
- ✅ Fast queries on recent data (most queries are for last 30 days)
- ✅ Easy archival (drop old partitions or move to cold storage)
- ✅ Consistent performance as data grows
- ✅ Better for time-series data

---

#### **job_logs** (Partitioned)
```sql
CREATE TABLE job_logs (
  id UUID DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  
  -- Log details
  log_level VARCHAR(20) NOT NULL,  -- 'info', 'warning', 'error', 'debug'
  message TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NULL,  -- Additional context (stack traces, etc.)
  
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Monthly partitions
CREATE TABLE job_logs_2025_11 PARTITION OF job_logs
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Indexes
CREATE INDEX idx_job_logs_execution_id ON job_logs(execution_id);
CREATE INDEX idx_job_logs_level ON job_logs(log_level);
```

**Purpose:** Detailed logging for debugging and troubleshooting

---

### Redis Usage

#### **Data Structures and Purposes:**

```javascript
// 1. Session Management (JWT Blacklist)
// When user logs out, add token to blacklist
await redis.setex(`session:blacklist:${token}`, 86400, 'true');  // TTL: 24h
const isBlacklisted = await redis.exists(`session:blacklist:${token}`);

// 2. Rate Limiting (Per-user throttling)
const key = `ratelimit:${userId}:${hourWindow}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 3600);  // First request, set 1-hour TTL
if (count > 100) throw new Error('Rate limit exceeded');

// 3. Active Jobs Tracking (Detect stuck jobs)
await redis.zadd('active:jobs', Date.now(), jobId);  // Add with timestamp as score
const stuckJobs = await redis.zrangebyscore('active:jobs', 0, Date.now() - 600000);  // >10 min
await redis.zrem('active:jobs', jobId);  // Remove when done

// 4. Bull Queues (Managed by Bull - don't access directly)
// bull:job-execution-queue:waiting
// bull:job-execution-queue:active
// bull:job-execution-queue:completed
// bull:notification-queue:waiting
```

**Why Each Data Structure:**
- **Strings with TTL** (blacklist, cache): Simple key-value with auto-expiration
- **Counters with TTL** (rate limiting): Fast increment, auto-reset
- **Sorted Sets** (active jobs): Score-based range queries (find stuck jobs)
- **Lists/Hashes** (Bull queues): Built-in queue data structures

---

### Data Flow

#### **1. Job Submission Flow**

```
CLIENT REQUEST
    ↓
API Gateway
• Validate JWT token
• Check rate limit (Redis: ratelimit:{userId})
• Validate request body (Zod schema)
    ↓
Job Service
• Parse cron expression (if applicable)
• Calculate next_run timestamp
• Calculate delay = next_run - now()
    ↓
PostgreSQL INSERT
INSERT INTO jobs (user_id, name, job_type, next_run, payload, status)
VALUES (...) RETURNING id;
    ↓
Bull Queue ADD
await jobQueue.add({ jobId, userId, payload }, { 
  delay: delayMs,      // Milliseconds until execution
  jobId: jobId         // Idempotency key (prevents duplicates)
});
    ↓
RESPONSE TO CLIENT
{ success: true, data: { id, next_run, status: 'active' } }
```

**Key Points:**
- PostgreSQL write happens first (source of truth)
- Bull queue uses calculated delay for precise timing
- jobId as Bull's job ID ensures idempotency

---

#### **2. Job Scheduling & Execution Flow**

```
Bull Queue (delay expires)
    ↓
Worker pulls job from queue
    ↓
PostgreSQL SELECT
SELECT * FROM jobs WHERE id = $1;  -- Get latest job config
    ↓
Redis ZADD
ZADD active:jobs <timestamp> <jobId>  -- Mark as running
    ↓
PostgreSQL INSERT
INSERT INTO job_executions (job_id, status, execution_time)
VALUES ($1, 'running', NOW()) RETURNING id;
    ↓
Execute Job Logic
• Run actual job code
• Apply timeout protection (default 5 min)
• Capture output/errors
    ↓
    ├─ SUCCESS ─────────────────┬─ FAILURE
    ↓                           ↓
PostgreSQL UPDATE              PostgreSQL UPDATE
• job_executions:              • job_executions:
  status='success'               status='failed'
  duration_ms                    error_message
  output                       • jobs: retry_count++
• jobs:                        
  last_executed_at             Bull Auto-Retry
  (if recurring: next_run)     • Wait with exponential backoff
                               • Retry if attempts < max_retries
If recurring:                  • If max exceeded: notification queue
• Calculate next_run           
• UPDATE jobs SET next_run     
• Bull queue ADD (re-schedule) 
    ↓
Redis ZREM
ZREM active:jobs <jobId>  -- Remove from running
    ↓
Bull removes from queue
```

---

#### **3. Safety Sync Flow (Every 5 Minutes)**

```
Scheduler Service (setInterval 5 min)
    ↓
PostgreSQL QUERY
SELECT * FROM jobs 
WHERE status = 'active' 
  AND next_run <= NOW()
ORDER BY next_run ASC
LIMIT 1000;
    ↓
Found missed jobs? (e.g., Redis crashed)
    ↓
FOR EACH missed job:
    Bull Queue ADD
    await jobQueue.add({ jobId, missedExecution: true }, {
      delay: 0,          // Execute immediately
      jobId: jobId       // Idempotency: won't duplicate if already in queue
    });
    ↓
Workers pick up and execute normally
```

**Why This Works:**
- PostgreSQL = source of truth (never loses jobs)
- 5-minute interval acceptable for most use cases
- Idempotency prevents duplicate execution
- Recovers from Redis crashes, worker downtime

---

#### **4. Retry Flow**

```
Job Execution FAILS
    ↓
Check retry_count < max_retries (3)?
    ↓ YES
Bull Auto-Retry
• Calculate backoff delay:
  Attempt 1: 1 min  (60000ms × 2^0)
  Attempt 2: 5 min  (60000ms × 2^1)
  Attempt 3: 15 min (60000ms × 2^2)
• Re-add to queue with delay
    ↓
Wait for backoff period
    ↓
Worker picks up for retry
• retry_attempt incremented
• Execute again
    ↓
    ├─ SUCCESS: Mark complete
    ↓ FAILURE: Loop back to retry check
    ↓ NO (max retries exceeded)
Notification Queue
await notificationQueue.add({
  type: 'job_failure',
  jobId, jobName, userId,
  error, attempts: 3
});
    ↓
PostgreSQL UPDATE
UPDATE jobs SET status = 'failed' WHERE id = $1;
```

---

#### **5. Notification Flow**

```
Notification Queue
(Job failed after retries)
    ↓
Notification Worker picks up
    ↓
PostgreSQL SELECT
SELECT u.email, j.name 
FROM users u 
JOIN jobs j ON j.user_id = u.id 
WHERE j.id = $1;
    ↓
NodeMailer Send Email
transporter.sendMail({
  to: user.email,
  subject: 'Job Failed: ' + jobName,
  html: failureEmailTemplate(...)
});
    ↓
PostgreSQL INSERT
INSERT INTO job_logs (execution_id, log_level, message)
VALUES ($1, 'info', 'Failure notification sent');
```

**Why Separate Queue:**
- Email sending is slow (2-5 seconds)
- Doesn't block job execution
- Independent retry if email fails

---

### When to Use PostgreSQL vs Redis

| Scenario | PostgreSQL | Redis | Reason |
|----------|-----------|-------|--------|
| User creates job | ✅ Write | ✅ Queue | Permanent record + temporary queue |
| Job waiting to execute | ❌ | ✅ Bull | Temporary, needs speed |
| Job currently running | ❌ | ✅ ZSET | Temporary state tracking |
| Job finishes | ✅ Write | ❌ | Permanent execution record |
| User queries history | ✅ Read | ⚠️ Cache 5min | Source of truth, cache for speed |
| Rate limit check | ❌ | ✅ Counter | Temporary, auto-reset |
| JWT logout | ❌ | ✅ TTL | Temporary until token expires |
| Recurring reschedule | ✅ Update | ✅ Re-queue | Update next_run + add to queue |
| Safety sync | ✅ Read | ❌ | PostgreSQL is source of truth |
| Dashboard stats | ✅ Read | ⚠️ Cache 1min | Complex aggregations |

**Key Principle:**
- **PostgreSQL** = Permanent data, source of truth, complex queries
- **Redis** = Temporary data, high-speed access, auto-expiration

---

## Summary

**Architecture Highlights:**
- ✅ Event-driven with Bull queues (no polling)
- ✅ Horizontal scalability (stateless API, multiple workers)
- ✅ PostgreSQL for reliability + Redis for speed
- ✅ Safety sync prevents missed jobs (5-minute recovery)
- ✅ Exponential backoff retry (3 attempts, 1-5-15 min)
- ✅ Partitioned tables for long-term performance

**Data Flow Principles:**
- PostgreSQL first (source of truth)
- Bull queue for scheduling (precise timing)
- Redis for temporary state (fast access)
- Safety sync for reliability (recover from failures)
- Async notifications (don't block execution)

**Scalability:**
- API: Add servers (stateless)
- Workers: Add processes (shared queue)
- Database: Read replicas (split read/write)
- Redis: Cluster mode (sharding)

### Why These Choices?

**PostgreSQL over MongoDB:**
- ✅ Strong ACID compliance (critical for job state)
- ✅ Complex queries with JOINs
- ✅ Better for transactional consistency
- ✅ Built-in JSON support (JSONB)

**BullMQ over RabbitMQ/Kafka:**
- ✅ Built specifically for job scheduling
- ✅ Uses existing Redis (no additional servers)
- ✅ Built-in retry with exponential backoff
- ✅ Simpler setup and maintenance
- ✅ Perfect for job volumes up to millions/day

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18 or higher ([Download](https://nodejs.org/))
- **PostgreSQL**: v15 or higher ([Download](https://www.postgresql.org/download/))
- **Redis**: v7 or higher ([Download](https://redis.io/download))
- **Docker** (Optional but recommended): For containerized deployment

### Verify Installations

```bash
node --version    # Should be v18+
npm --version     # Should be 9+
psql --version    # Should be 15+
redis-cli --version  # Should be 7+
```

---

## 🚀 Installation

### Option 1: Docker Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/aneesazc/chronos.git
cd chronos-backend

# Install dependencies
npm i

# Configure environment variables
cp .env.example .env

# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# Wait 10-15 seconds for services to be ready
sleep 15

# Run database migrations
npm run migrate

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f
```

### Option 2: Local Setup

```bash
# Clone the repository
git clone https://github.com/aneesazc/chronos.git
cd chronos-backend

# Install dependencies
npm install

# Start PostgreSQL (if not running)
# Start Redis (if not running)
redis-server

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Start API server (Terminal 1)
npm run dev

# Start worker process (Terminal 2)
npm run worker:dev
```

---

### Database Schema Overview

**Tables Created:**
- `users` - User accounts
- `jobs` - Job definitions and configurations
- `job_executions` - Execution history (partitioned by month)
- `job_logs` - Detailed execution logs (partitioned by month)

**Views Created:**
- `jobs_due_for_execution` - Active jobs due in next 5 minutes
- `job_execution_stats` - Aggregated statistics per job

**Indexes Created:**
- Performance indexes on all foreign keys
- Composite indexes for common queries
- Partial indexes for filtered queries

---

## 🏃 Running the Application

### Development Mode

**With Docker:**
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api     # API logs
docker-compose logs -f worker  # Worker logs

# Restart services
docker-compose restart

# Stop services
docker-compose down
```

**Without Docker:**
```bash
# Terminal 1: Start API server
npm run dev

# Terminal 2: Start worker process
npm run worker:dev
```

### Production Mode

```bash
# Start API server
npm start

# Start worker process (in separate terminal/process manager)
npm run worker

# Or use PM2 for process management
pm2 start npm --name "chronos-api" -- start
pm2 start npm --name "chronos-worker" -- run worker
```

### Verify Installation

```bash
# Check API health
curl http://localhost:5000/health

# Expected response:
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-23T...",
  "uptime": 123.456,
  "environment": "development",
  "services": {
    "database": "connected",
    "redis": "connected" }
}

```

---

## 📡 API Documentation

### Base URL

```
http://localhost:5000/api/v1
```

### Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

### Authentication Endpoints

#### Register User

**POST** `/api/v1/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "created_at": "2025-11-23T..."
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
}
```

**Validation Rules:**
- Email: Valid format, unique
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number

---

#### Login

**POST** `/api/v1/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
}
```

---

#### Logout

**POST** `/api/v1/auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### Get Current User

**GET** `/api/v1/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2025-11-23T...",
    "updated_at": "2025-11-23T..."
  }
}
```

---

### Job Management Endpoints

#### Create Job

**POST** `/api/v1/jobs`

**Headers:**
```
Authorization: Bearer <token>
```

**Request - Immediate Job:**
```json
{
  "name": "Data Processing",
  "description": "Process user data",
  "job_type": "one-time",
  "schedule_type": "immediate",
  "payload": {
    "data_source": "users",
    "operation": "aggregate"
  },
  "timeout_seconds": 300,
  "max_retries": 3
}
```

**Request - Scheduled Job:**
```json
{
  "name": "Weekly Report",
  "job_type": "one-time",
  "schedule_type": "scheduled",
  "scheduled_time": "2025-11-25T09:00:00Z",
  "payload": {
    "report_type": "sales",
    "format": "pdf"
  }
}
```

**Request - Recurring Job (Cron):**
```json
{
  "name": "Daily Backup",
  "description": "Backup database daily at midnight",
  "job_type": "recurring",
  "schedule_type": "cron",
  "cron_expression": "0 0 * * *",
  "payload": {
    "backup_type": "full",
    "retention_days": 7
  },
  "timeout_seconds": 600
}
```

**Cron Expression Examples:**
```
*/5 * * * *     # Every 5 minutes
0 * * * *       # Every hour
0 9 * * *       # Every day at 9 AM
0 9 * * 1       # Every Monday at 9 AM
0 9 * * 1-5     # Every weekday at 9 AM
0 0 1 * *       # First day of every month at midnight
0 0 * * 0       # Every Sunday at midnight
```

**Response (201):**
```json
{
  "success": true,
  "message": "Job created successfully",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Daily Backup",
    "job_type": "recurring",
    "schedule_type": "cron",
    "cron_expression": "0 0 * * *",
    "next_run": "2025-11-24T00:00:00Z",
    "status": "active",
    "created_at": "2025-11-23T..."
  }
}
```

---

#### List Jobs

**GET** `/api/v1/jobs`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
```
?status=active            # Filter by status: pending, active, paused, completed, failed
&job_type=recurring       # Filter by type: one-time, recurring
&page=1                   # Page number (default: 1)
&limit=20                 # Items per page (default: 20, max: 100)
&sort_by=next_run         # Sort field: created_at, next_run, name, updated_at
&sort_order=asc           # Sort order: asc, desc (default: desc)
```

**Example Request:**
```
GET /api/v1/jobs?status=active&sort_by=next_run&sort_order=asc&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "uuid",
        "name": "Daily Backup",
        "job_type": "recurring",
        "schedule_type": "cron",
        "cron_expression": "0 0 * * *",
        "status": "active",
        "next_run": "2025-11-24T00:00:00Z",
        "last_executed_at": "2025-11-23T00:00:00Z",
        "created_at": "2025-11-01T..."
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 10,
      "total_pages": 5
    }
  }
}
```

---

#### Get Job by ID

**GET** `/api/v1/jobs/:jobId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Daily Backup",
    "description": "Backup database daily",
    "job_type": "recurring",
    "schedule_type": "cron",
    "cron_expression": "0 0 * * *",
    "next_run": "2025-11-24T00:00:00Z",
    "payload": {
      "backup_type": "full",
      "retention_days": 7
    },
    "status": "active",
    "timeout_seconds": 600,
    "retry_count": 0,
    "max_retries": 3,
    "created_at": "2025-11-01T...",
    "updated_at": "2025-11-23T...",
    "last_executed_at": "2025-11-23T00:00:00Z",
    "statistics": {
      "total_executions": 23,
      "successful_executions": 23,
      "failed_executions": 0,
      "average_duration_ms": 2500
    }
  }
}
```

---

#### Update Job

**PATCH** `/api/v1/jobs/:jobId`

**Headers:**
```
Authorization: Bearer <token>
```

**Request (all fields optional):**
```json
{
  "name": "Updated Job Name",
  "description": "Updated description",
  "cron_expression": "0 1 * * *",
  "payload": {
    "backup_type": "incremental"
  },
  "timeout_seconds": 900,
  "status": "paused"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Job updated successfully",
  "data": {
    "id": "uuid",
    "name": "Updated Job Name",
    "status": "paused",
    "updated_at": "2025-11-23T..."
  }
}
```

**Notes:**
- Updating `cron_expression` recalculates `next_run`
- Updating `status` to 'paused' removes job from queue
- Updating `status` to 'active' re-adds job to queue

---

#### Delete Job

**DELETE** `/api/v1/jobs/:jobId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Job deleted successfully"
}
```

**Note:** This is a soft delete. Job history is preserved.

---

#### Pause Job

**POST** `/api/v1/jobs/:jobId/pause`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Job paused successfully",
  "data": {
    "id": "uuid",
    "status": "paused",
    "paused_at": "2025-11-23T..."
  }
}
```

**Requirements:**
- Job must be `active`
- Only `recurring` jobs can be paused

---

#### Resume Job

**POST** `/api/v1/jobs/:jobId/resume`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Job resumed successfully",
  "data": {
    "id": "uuid",
    "status": "active",
    "next_run": "2025-11-24T00:00:00Z",
    "resumed_at": "2025-11-23T..."
  }
}
```

---

#### Execute Job Manually

**POST** `/api/v1/jobs/:jobId/execute`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Job execution triggered",
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "message": "Job queued for immediate execution"
  }
}
```

**Use Cases:**
- Test a job without waiting for scheduled time
- Re-run a failed job immediately
- Manual data refresh

---

#### Get Upcoming Jobs

**GET** `/api/v1/jobs/upcoming`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "uuid",
        "name": "Daily Backup",
        "next_run": "2025-11-24T00:00:00Z",
        "job_type": "recurring"
      }
    ],
    "count": 1
  }
}
```

**Note:** Returns jobs scheduled for next 24 hours.

---

### Execution History Endpoints

#### Get Job Executions

**GET** `/api/v1/jobs/:jobId/executions`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
```
?status=success          # Filter: running, success, failed, timeout
&page=1
&limit=20
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "executions": [
      {
        "id": "uuid",
        "job_id": "uuid",
        "execution_time": "2025-11-23T00:00:00Z",
        "status": "success",
        "retry_attempt": 0,
        "duration_ms": 2500,
        "output": {
          "records_processed": 1000,
          "status": "completed"
        }
      }
    ],
    "pagination": {
      "total": 23,
      "page": 1,
      "limit": 20,
      "total_pages": 2
    }
  }
}
```

---

#### Get Execution Details

**GET** `/api/v1/executions/:executionId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "job_id": "uuid",
    "job_name": "Daily Backup",
    "execution_time": "2025-11-23T00:00:00Z",
    "status": "success",
    "retry_attempt": 0,
    "duration_ms": 2500,
    "output": {
      "records_processed": 1000
    },
    "error_message": null,
    "created_at": "2025-11-23T00:00:00Z"
  }
}
```

---

#### Get Execution Logs

**GET** `/api/v1/executions/:executionId/logs`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "execution_id": "uuid",
    "logs": [
      {
        "id": "uuid",
        "level": "info",
        "message": "Job execution started",
        "metadata": {
          "jobName": "Daily Backup"
        },
        "timestamp": "2025-11-23T00:00:00.000Z"
      },
      {
        "id": "uuid",
        "level": "info",
        "message": "Job completed successfully",
        "metadata": {
          "duration": 2500
        },
        "timestamp": "2025-11-23T00:00:02.500Z"
      }
    ]
  }
}
```

---

### Dashboard Endpoints

#### Get Dashboard Statistics

**GET** `/api/v1/dashboard/stats`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jobs": {
      "total": 25,
      "active": 15,
      "completed": 5,
      "paused": 3,
      "failed": 2,
      "onetime": 10,
      "recurring": 15
    },
    "executions": {
      "total": 1250,
      "successful": 1200,
      "failed": 50,
      "success_rate": 96.00,
      "avg_duration_seconds": 2.50,
      "max_duration_seconds": 8.30,
      "min_duration_seconds": 0.50
    },
    "upcoming_jobs": [
      {
        "id": "uuid",
        "name": "Daily Backup",
        "next_run": "2025-11-24T00:00:00Z",
        "job_type": "recurring"
      }
    ],
    "recent_executions": [
      {
        "id": "uuid",
        "job_id": "uuid",
        "job_name": "Daily Backup",
        "status": "success",
        "execution_time": "2025-11-23T00:00:00Z",
        "duration_ms": 2500
      }
    ]
  }
}
```

---

#### Get System Health

**GET** `/api/v1/dashboard/health`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-23T...",
  "version": "1.0.0",
  "services": {
    "database": {
      "status": "healthy",
      "latency_ms": 5
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 2
    },
    "queue": {
      "status": "healthy",
      "metrics": {
        "jobs": {
          "waiting": 5,
          "active": 3,
          "completed": 100,
          "failed": 2,
          "delayed": 10
        },
        "notifications": {
          "waiting": 0,
          "active": 0,
          "completed": 50,
          "failed": 0
        }
      }
    }
  },
  "system": {
    "uptime_seconds": 123456,
    "memory": {
      "used_mb": 245,
      "total_mb": 512
    },
    "node_version": "v18.17.0",
    "environment": "production"
  }
}
```

**Status Codes:**
- 200: System healthy
- 503: System unhealthy or degraded

---

### Error Responses

All errors follow this format:

```json
{
  "error": true,
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-11-23T..."
}
```

---

## 🧪 Testing

### Run Test Scripts

```bash
# Test database layer
npm run test:db

# Test authentication system
npm run test:auth

# Test job management
npm run test:jobs

# Run all tests (if Jest is configured)
npm test
```

### Manual Testing with cURL

#### Register and Login
```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'

# Login (save the token)
TOKEN=$(curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }' | jq -r '.data.token')

echo $TOKEN
```

#### Create and Manage Jobs
```bash
# Create immediate job
curl -X POST http://localhost:5000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Job",
    "job_type": "one-time",
    "schedule_type": "immediate",
    "payload": {"test": true}
  }'

# List jobs
curl -X GET http://localhost:5000/api/v1/jobs \
  -H "Authorization: Bearer $TOKEN"

# Get job details
curl -X GET http://localhost:5000/api/v1/jobs/{JOB_ID} \
  -H "Authorization: Bearer $TOKEN"

# Create recurring job
curl -X POST http://localhost:5000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Recurring Job",
    "job_type": "recurring",
    "schedule_type": "cron",
    "cron_expression": "*/5 * * * *",
    "payload": {"interval": "5min"}
  }'

# Manually trigger job
curl -X POST http://localhost:5000/api/v1/jobs/{JOB_ID}/execute \
  -H "Authorization: Bearer $TOKEN"
```

#### Check System Health
```bash
# Public health check
curl http://localhost:5000/health

# Detailed health (requires auth)
curl -X GET http://localhost:5000/api/v1/dashboard/health \
  -H "Authorization: Bearer $TOKEN"

# Dashboard stats
curl -X GET http://localhost:5000/api/v1/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Monitoring

### Health Monitoring

```bash
# Health check script
#!/bin/bash
HEALTH_URL="http://localhost:5000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "✅ Chronos is healthy"
    exit 0
else
    echo "❌ Chronos is unhealthy (HTTP $RESPONSE)"
    exit 1
fi
```

### Queue Monitoring

Monitor Bull queues using the dashboard endpoint:

```bash
curl -X GET http://localhost:5000/api/v1/dashboard/health \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.services.queue.metrics'
```

### Database Performance

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Check slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
ORDER BY duration DESC;

-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Redis Monitoring

```bash
# Connect to Redis CLI
redis-cli

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# Check keyspace
INFO keyspace

# Monitor commands in real-time
MONITOR
```

### Recommended Monitoring Tools

- **Application Monitoring**: New Relic, Datadog, AppDynamics
- **Infrastructure**: Prometheus + Grafana
- **Logs Aggregation**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Error Tracking**: Sentry
- **Uptime Monitoring**: Pingdom, UptimeRobot

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Issue: Port 5000 already in use

**Solution:**
```bash
# Find process using port 5000
lsof -ti:5000

# Kill the process
kill -9 $(lsof -ti:5000)

# Or change the port in .env
PORT=5001
```

#### Issue: Database connection failed

**Solution:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql
# or
docker-compose ps postgres

# Test connection manually
psql -U chronos_user -d chronos_db -h localhost

# Check credentials in .env
# Verify DATABASE_URL format
```

#### Issue: Redis connection failed

**Solution:**
```bash
# Check if Redis is running
sudo systemctl status redis
# or
docker-compose ps redis

# Test connection
redis-cli ping

# Check REDIS_HOST and REDIS_PORT in .env
```

#### Issue: Jobs not executing

**Solution:**
```bash
# Check worker is running
docker-compose ps worker
# or
pm2 status chronos-worker

# Check worker logs
docker-compose logs -f worker

# Check queue depth
curl http://localhost:5000/api/v1/dashboard/health | jq '.services.queue'

# Verify job status in database
psql -U chronos_user -d chronos_db -c "SELECT id, name, status, next_run FROM jobs WHERE status = 'active';"
```

#### Issue: Migrations fail

**Solution:**
```bash
# Check database connection
npm run migrate:status

# Reset and re-run (⚠️ deletes data)
npm run migrate:reset
npm run migrate

# Check migration logs
tail -f logs/combined.log
```

#### Issue: High memory usage

**Solution:**
```bash
# Check Node.js memory
pm2 monit

# Restart services
pm2 restart all

# Adjust worker concurrency in .env
WORKER_CONCURRENCY=3  # Reduce from 5

# Check for memory leaks in logs
grep -i "memory" logs/error.log
```

#### Issue: Slow API responses

**Solution:**
```bash
# Check database query performance
# Enable slow query logging in PostgreSQL

# Check connection pool
# Increase DB_POOL_MAX in .env
DB_POOL_MAX=20

# Add indexes for frequently queried fields
# Check schema.sql for recommended indexes

# Monitor API response times
tail -f logs/combined.log | grep "duration"
```

#### Issue: Authentication errors

**Solution:**
```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Check token expiration
# Default is 24 hours (86400 seconds)

# Clear Redis token blacklist (if needed)
redis-cli FLUSHDB

# Re-generate token by logging in again
```

#### Issue: Email notifications not working

**Solution:**
```bash
# Check SMTP configuration in .env
# For Gmail, ensure you're using an App Password

# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
transporter.verify().then(console.log).catch(console.error);
"

# Check notification queue
curl http://localhost:5000/api/v1/dashboard/health | jq '.services.queue.metrics.notifications'
```

#### Issue: Docker containers keep restarting

**Solution:**
```bash
# Check container logs
docker-compose logs api
docker-compose logs worker

# Check if services are healthy
docker-compose ps

# Verify environment variables
docker-compose exec api printenv | grep DB_

# Check resource limits
docker stats

# Increase memory limit in docker-compose.yml if needed
```

---

## 📁 Project Structure

```
chronos-backend/
├── src/
│   ├── config/                 # Configuration files
│   │   ├── database.js         # PostgreSQL configuration
│   │   ├── redis.js            # Redis configuration
│   │   ├── queue.js            # BullMQ queue setup
│   │   └── logger.js           # Winston logger configuration
│   │
│   ├── database/               # Database related
│   │   ├── schema.sql          # Complete database schema
│   │   ├── migrate.js          # Migration runner
│   │   └── test-db-layer.js    # Database layer tests
│   │
│   ├── models/                 # Data models
│   │   ├── index.js            # Model exports
│   │   ├── User.js             # User model
│   │   ├── Job.js              # Job model
│   │   ├── JobExecution.js     # Execution model
│   │   └── JobLog.js           # Log model
│   │
│   ├── controllers/            # Route controllers
│   │   ├── authController.js   # Authentication logic
│   │   ├── jobController.js    # Job management logic
│   │   ├── executionController.js  # Execution history logic
│   │   └── dashboardController.js  # Dashboard statistics
│   │
│   ├── services/               # Business logic services
│   │   ├── authService.js      # Auth business logic
│   │   ├── jobService.js       # Job business logic
│   │   ├── schedulerService.js # Scheduler (safety sync)
│   │   ├── executionService.js # Job execution logic
│   │   └── notificationService.js  # Email notifications
│   │
│   ├── middleware/             # Express middleware
│   │   ├── auth.js             # JWT authentication
│   │   ├── errorHandler.js     # Global error handler
│   │   └── rateLimiter.js      # Rate limiting
│   │
│   ├── routes/                 # API routes
│   │   ├── index.js            # Route aggregation
│   │   ├── auth.js             # Auth routes
│   │   ├── jobs.js             # Job routes
│   │   ├── executions.js       # Execution routes
│   │   └── dashboard.js        # Dashboard routes
│   │
│   ├── workers/                # BullMQ workers
│   │   ├── jobWorker.js        # Main job execution worker
│   │   └── notificationWorker.js   # Notification worker
│   │
│   ├── utils/                  # Utility functions
│   │   ├── cronParser.js       # Cron expression parsing
│   │   ├── dateUtils.js        # Date/time utilities
│   │   └── validators.js       # Zod validation schemas
│   │
│   ├── tests/                  # Test scripts
│   │   ├── test-auth-system.js # Auth system tests
│   │   └── test-job-management.js  # Job management tests
│   │
│   ├── app.js                  # Express app setup
│   └── server.js               # Server entry point
│
├── logs/                       # Application logs
│   ├── combined.log            # All logs
│   └── error.log               # Error logs only
│
├── docker-compose.yml          # Docker services configuration
├── Dockerfile                  # Docker image definition
├── .env.example                # Example environment variables
├── .env                        # Environment variables (git-ignored)
├── .gitignore                  # Git ignore rules
├── package.json                # NPM dependencies and scripts
├── package-lock.json           # NPM dependency lock
└── README.md                   # This file
```

---

## 🔄 Data Flow

### Job Creation Flow
```
User → API (POST /jobs)
     ↓
Validate Request (Zod)
     ↓
Save to PostgreSQL (source of truth)
     ↓
Calculate delay (next_run - now)
     ↓
Add to BullMQ Queue (with delay)
     ↓
Return Response to User
```

### Job Execution Flow
```
BullMQ Queue (delay expires)
     ↓
Worker picks up job
     ↓
Fetch full job from PostgreSQL
     ↓
Create execution record (status: running)
     ↓
Execute job logic (with timeout)
     ↓
Update execution record (success/failed)
     ↓
If recurring: Calculate next_run
     ↓
Update PostgreSQL + Re-queue
```

### Safety Sync Flow (Every 5 min)
```
Scheduler Service (setInterval)
     ↓
Query PostgreSQL:
  SELECT * FROM jobs
  WHERE status = 'active'
    AND next_run <= NOW()
     ↓
Found missed jobs?
     ↓
Add each to BullMQ Queue (delay: 0)
     ↓
Workers will execute them
```

---

## 📚 Additional Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Crontab.guru](https://crontab.guru/) - Cron expression helper

---

<div align="center">

**Built with ❤️ for Backend Engineers**

[⬆ Back to Top](#chronos-job-scheduler---backend-api)

</div>