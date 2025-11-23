# Chronos Job Scheduler - Quick Start Guide

Get your Chronos Job Scheduler up and running in minutes!

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Docker** and **Docker Compose** - [Download here](https://www.docker.com/get-started)
- **Git** - [Download here](https://git-scm.com/)

## 🚀 Quick Setup (5 Minutes)

### Step 1: Clone the Repository

```bash
git clone https://github.com/aneesazc/chronos.git
cd chronos
```

### Step 2: Backend Setup

```bash

# starting docker
start docker on your machine

# Navigate to backend directory
cd chronos-backend

# Install dependencies
npm install

# Set up env variables for the backend
cp .env.example .env


# Start Docker services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# Wait 10-15 seconds for services to be ready, then run migrations
npm run migrate
```

**What's happening?**

- Docker Compose starts PostgreSQL (database) and Redis (cache/queue)
- The migration creates all necessary database tables and schema
- Backend API will be available at `http://localhost:5000`

### Step 3: Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd ../chronos-frontend

# Install dependencies
npm install

# Set up env variables for the frontend
cp .env.example .env

# Start development server
npm run dev
```

**What's happening?**

- Installs React and all required packages
- Starts the Vite development server
- Frontend will be available at `http://localhost:3000`

### Step 4: Access the Application

1. Open your browser and go to `http://localhost:3000`
2. Create a new account (Register)
3. Start creating and managing jobs!

## 🎯 First Steps After Setup

### Create Your First Job

1. **Login** to your account
2. Click **"Create Job"** button
3. Try creating a simple immediate job:
   - **Name**: "My First Job"
   - **Type**: One-time
   - **Schedule**: Immediate
   - **Payload**: `{ "test": true }`
4. Watch it execute in real-time!

### Try a Recurring Job

Create a job that runs every 5 minutes:

```json
{
  "name": "Data Sync",
  "job_type": "recurring",
  "schedule_type": "cron",
  "cron_expression": "*/5 * * * *",
  "payload": {
    "task": "sync_data"
  }
}
```

## 📊 Check System Health

### Backend Health Check

```bash
curl http://localhost:5000/health
```

### View Docker Services

```bash
docker-compose ps
```

### View Logs

```bash
# API Server logs
docker-compose logs -f api

# Worker logs
docker-compose logs -f worker

# Database logs
docker-compose logs -f postgres
```

## 🛠️ Common Commands

### Backend Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Run migrations
npm run migrate

# Reset database (⚠️ deletes all data)
npm run migrate:reset

# Check migration status
npm run migrate:status

# Run tests
npm test

# Run specific test suites
npm run test:db
npm run test:auth
npm run test:jobs
```

### Frontend Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Happy Scheduling! ⏰**
