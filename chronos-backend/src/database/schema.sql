
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================================================
-- JOBS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Job metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Job type and scheduling
  job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('one-time', 'recurring')),
  schedule_type VARCHAR(20) NOT NULL CHECK (schedule_type IN ('immediate', 'scheduled', 'cron')),
  scheduled_time TIMESTAMP WITH TIME ZONE NULL,
  cron_expression VARCHAR(100) NULL,
  next_run TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Job configuration
  payload JSONB NOT NULL DEFAULT '{}',
  timeout_seconds INTEGER DEFAULT 300 CHECK (timeout_seconds > 0 AND timeout_seconds <= 3600),
  
  -- Status and retry
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'failed', 'deleted')),
  retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_executed_at TIMESTAMP WITH TIME ZONE NULL,
  
  -- Schedule validation constraints
  CONSTRAINT valid_schedule CHECK (
    (schedule_type = 'immediate' AND scheduled_time IS NULL AND cron_expression IS NULL) OR
    (schedule_type = 'scheduled' AND scheduled_time IS NOT NULL AND cron_expression IS NULL) OR
    (schedule_type = 'cron' AND cron_expression IS NOT NULL)
  ),
  
  -- Job type validation
  CONSTRAINT valid_job_type CHECK (
    (job_type = 'one-time' AND cron_expression IS NULL) OR
    (job_type = 'recurring' AND cron_expression IS NOT NULL)
  )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Partial index for active recurring jobs (most queried)
CREATE INDEX IF NOT EXISTS idx_jobs_active_recurring 
ON jobs(next_run) 
WHERE status = 'active' AND job_type = 'recurring';

-- =============================================================================
-- JOB EXECUTIONS TABLE (Partitioned by execution_time)
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_executions (
  id UUID DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL,
  
  -- Execution details
  execution_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'failed', 'timeout')),
  retry_attempt INTEGER DEFAULT 0 CHECK (retry_attempt >= 0),
  
  -- Performance metrics
  duration_ms INTEGER CHECK (duration_ms >= 0),
  
  -- Results and errors
  error_message TEXT NULL,
  output JSONB NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (id, execution_time)
) PARTITION BY RANGE (execution_time);

-- Create partitions for current and next 3 months
-- November 2025
CREATE TABLE IF NOT EXISTS job_executions_2025_11 PARTITION OF job_executions
FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

-- December 2025
CREATE TABLE IF NOT EXISTS job_executions_2025_12 PARTITION OF job_executions
FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

-- January 2026
CREATE TABLE IF NOT EXISTS job_executions_2026_01 PARTITION OF job_executions
FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

-- February 2026
CREATE TABLE IF NOT EXISTS job_executions_2026_02 PARTITION OF job_executions
FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

-- Indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_executions_status ON job_executions(status);
CREATE INDEX IF NOT EXISTS idx_job_executions_execution_time ON job_executions(execution_time DESC);
CREATE INDEX IF NOT EXISTS idx_job_executions_job_time ON job_executions(job_id, execution_time DESC);

-- =============================================================================
-- JOB LOGS TABLE (Partitioned by timestamp)
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_logs (
  id UUID DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL,
  
  -- Log details
  log_level VARCHAR(20) NOT NULL CHECK (log_level IN ('info', 'warning', 'error', 'debug')),
  message TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Additional context
  metadata JSONB NULL,
  
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and next 3 months
-- November 2025
CREATE TABLE IF NOT EXISTS job_logs_2025_11 PARTITION OF job_logs
FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

-- December 2025
CREATE TABLE IF NOT EXISTS job_logs_2025_12 PARTITION OF job_logs
FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

-- January 2026
CREATE TABLE IF NOT EXISTS job_logs_2026_01 PARTITION OF job_logs
FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

-- February 2026
CREATE TABLE IF NOT EXISTS job_logs_2026_02 PARTITION OF job_logs
FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

-- Indexes on partitioned table
CREATE INDEX IF NOT EXISTS idx_job_logs_execution_id ON job_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_job_logs_timestamp ON job_logs(timestamp DESC);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for jobs table
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View for active jobs that need to be executed soon (next 5 minutes)
CREATE OR REPLACE VIEW jobs_due_for_execution AS
SELECT 
  j.id,
  j.user_id,
  j.name,
  j.job_type,
  j.next_run,
  j.payload,
  j.timeout_seconds,
  j.max_retries,
  j.retry_count
FROM jobs j
WHERE j.status = 'active'
  AND j.next_run <= CURRENT_TIMESTAMP + INTERVAL '5 minutes'
ORDER BY j.next_run ASC;

-- View for job execution statistics
CREATE OR REPLACE VIEW job_execution_stats AS
SELECT 
  j.id AS job_id,
  j.name AS job_name,
  j.user_id,
  COUNT(je.id) AS total_executions,
  COUNT(CASE WHEN je.status = 'success' THEN 1 END) AS successful_executions,
  COUNT(CASE WHEN je.status = 'failed' THEN 1 END) AS failed_executions,
  COUNT(CASE WHEN je.status = 'timeout' THEN 1 END) AS timeout_executions,
  ROUND(AVG(je.duration_ms)) AS avg_duration_ms,
  MAX(je.execution_time) AS last_execution_time
FROM jobs j
LEFT JOIN job_executions je ON j.id = je.job_id
GROUP BY j.id, j.name, j.user_id;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE users IS 'User accounts for job ownership';
COMMENT ON TABLE jobs IS 'Job definitions and configurations';
COMMENT ON TABLE job_executions IS 'Historical record of all job executions (partitioned by month)';
COMMENT ON TABLE job_logs IS 'Detailed logs for job executions (partitioned by month)';

COMMENT ON COLUMN jobs.next_run IS 'Next scheduled execution time - critical for scheduler';
COMMENT ON COLUMN jobs.payload IS 'Flexible JSONB field for job-specific parameters';
COMMENT ON COLUMN jobs.cron_expression IS 'Standard cron format: minute hour day month weekday';
COMMENT ON COLUMN job_executions.duration_ms IS 'Execution duration in milliseconds';