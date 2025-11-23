# Chronos - Job Scheduler System

A distributed, scalable job scheduling system built with Node.js, PostgreSQL, Redis, and BullMQ.

## Features

- ✅ One-time and recurring job scheduling
- ✅ Cron-based scheduling support
- ✅ Automatic retry with exponential backoff
- ✅ Job management (pause, resume, delete)
- ✅ Execution history and detailed logging
- ✅ Email notifications on failures
- ✅ RESTful API with JWT authentication
- ✅ Horizontal scalability
- ✅ Rate limiting

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL 14+
- **Cache/Queue:** Redis 7+ & BullMQ
- **Authentication:** JWT
- **Logging:** Winston
- **Validation:** Zod

## Project Structure

```
chronos/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.js   # PostgreSQL configuration
│   │   ├── redis.js      # Redis & BullMQ configuration
│   │   ├── queue.js      # Queue setup
│   │   └── logger.js     # Winston logger setup
│   ├── database/         # Database related
│   │   ├── migrations/   # SQL migration files
│   │   ├── schema.sql    # Complete database schema
│   │   └── migrate.js    # Migration runner
│   ├── models/           # Data models
│   │   ├── User.js
│   │   ├── Job.js
│   │   ├── JobExecution.js
│   │   └── JobLog.js
│   ├── controllers/      # Route controllers
│   │   ├── authController.js
│   │   ├── jobController.js
│   │   ├── executionController.js
│   │   └── dashboardController.js
│   ├── services/         # Business logic
│   │   ├── authService.js
│   │   ├── jobService.js
│   │   ├── schedulerService.js
│   │   ├── executionService.js
│   │   └── notificationService.js
│   ├── middleware/       # Express middleware
│   │   ├── auth.js       # JWT authentication
│   │   ├── validation.js # Request validation
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   ├── routes/           # API routes
│   │   ├── auth.js
│   │   ├── jobs.js
│   │   ├── executions.js
│   │   └── dashboard.js
│   ├── workers/          # BullMQ workers
│   │   ├── jobWorker.js  # Main job execution worker
│   │   └── notificationWorker.js
│   ├── utils/            # Utility functions
│   │   ├── cronParser.js
│   │   ├── dateUtils.js
│   │   └── validators.js
│   ├── app.js            # Express app setup
│   └── server.js         # Server entry point
├── tests/                # Test files
│   ├── unit/
│   └── integration/
├── logs/                 # Application logs
├── .env.example          # Example environment variables
├── .gitignore
├── package.json
├── README.md
└── docker-compose.yml    # Docker setup for local development
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+

#### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

### Job Management

#### Create Job
```http
POST /api/v1/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Weekly Newsletter",
  "description": "Send newsletter every Monday",
  "job_type": "recurring",
  "schedule_type": "cron",
  "cron_expression": "0 9 * * 1",
  "payload": {
    "template": "weekly_digest"
  }
}
```

#### List Jobs
```http
GET /api/v1/jobs?status=active&page=1&limit=20
Authorization: Bearer <token>
```

#### Get Job Details
```http
GET /api/v1/jobs/:jobId
Authorization: Bearer <token>
```

#### Update Job
```http
PATCH /api/v1/jobs/:jobId
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Job Name",
  "status": "paused"
}
```

#### Delete Job
```http
DELETE /api/v1/jobs/:jobId
Authorization: Bearer <token>
```

#### Pause Job
```http
POST /api/v1/jobs/:jobId/pause
Authorization: Bearer <token>
```

#### Resume Job
```http
POST /api/v1/jobs/:jobId/resume
Authorization: Bearer <token>
```

#### Trigger Job Manually
```http
POST /api/v1/jobs/:jobId/execute
Authorization: Bearer <token>
```

### Execution History

#### Get Job Executions
```http
GET /api/v1/jobs/:jobId/executions?page=1&limit=20
Authorization: Bearer <token>
```

#### Get Execution Details
```http
GET /api/v1/executions/:executionId
Authorization: Bearer <token>
```

#### Get Execution Logs
```http
GET /api/v1/executions/:executionId/logs
Authorization: Bearer <token>
```

### Dashboard

#### Get Statistics
```http
GET /api/v1/dashboard/stats
Authorization: Bearer <token>
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## Docker Setup (Optional)

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Scaling

### Horizontal Scaling

**API Servers:**
- Stateless design allows multiple instances behind a load balancer
- Each instance connects to the same PostgreSQL and Redis

**Workers:**
- Run multiple worker processes on different servers
- All workers connect to the same Redis queue
- Scale based on queue depth and job processing requirements

**Example:**
```bash
# Server 1
npm start                    # API Server 1
npm run worker              # Worker 1

# Server 2
npm start                    # API Server 2
npm run worker              # Worker 2

# And so on...
```

## Monitoring

- **Health Check:** `GET /api/v1/health`
- **Queue Metrics:** Available through BullMQ Board (optional)
- **Logs:** Check `logs/` directory or configure external logging

## Architecture Highlights

1. **PostgreSQL** - Source of truth for all job data
2. **BullMQ/Redis** - High-performance job queue with delayed execution
3. **Safety Sync** - Every 5 minutes, checks PostgreSQL for missed jobs
4. **Retry Logic** - Exponential backoff (1min, 5min, 15min)
5. **Stateless API** - Easy horizontal scaling
6. **Worker Pool** - Multiple concurrent job executions per worker

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please create an issue in the GitHub repository.