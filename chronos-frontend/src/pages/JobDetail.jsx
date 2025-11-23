import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Play, Pause, Trash2, Clock, Calendar, Code } from 'lucide-react';
import { jobService } from '../services/jobService';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { formatDate, formatRelativeTime, getStatusColor, getJobTypeLabel, getScheduleTypeLabel } from '../utils/helpers';

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJob();
  }, [id]);

  const loadJob = async () => {
    try {
      setLoading(true);
      const response = await jobService.getJobById(id);
      setJob(response.data);
    } catch (error) {
      toast.error('Failed to load job details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseJob = async () => {
    try {
      await jobService.pauseJob(id);
      toast.success('Job paused successfully');
      loadJob();
    } catch (error) {
      toast.error('Failed to pause job');
    }
  };

  const handleResumeJob = async () => {
    try {
      await jobService.resumeJob(id);
      toast.success('Job resumed successfully');
      loadJob();
    } catch (error) {
      toast.error('Failed to resume job');
    }
  };

  const handleDeleteJob = async () => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await jobService.deleteJob(id);
      toast.success('Job deleted successfully');
      navigate('/jobs');
    } catch (error) {
      toast.error('Failed to delete job');
    }
  };

  const handleExecuteJob = async () => {
    try {
      await jobService.executeJob(id);
      toast.success('Job execution triggered');
    } catch (error) {
      toast.error('Failed to execute job');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500 text-lg mb-4">Job not found</p>
        <Link to="/jobs" className="btn btn-primary">
          Back to Jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/jobs')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{job.name}</h1>
            <div className="flex items-center space-x-2 mt-2">
              <span className={`badge ${getStatusColor(job.status)}`}>
                {job.status}
              </span>
              <span className="badge badge-gray">
                {getJobTypeLabel(job.job_type)}
              </span>
              <span className="badge badge-info">
                {getScheduleTypeLabel(job.schedule_type)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExecuteJob}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Play className="w-5 h-5" />
            <span>Execute Now</span>
          </button>

          {job.status === 'active' ? (
            <button
              onClick={handlePauseJob}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <Pause className="w-5 h-5" />
              <span>Pause</span>
            </button>
          ) : job.status === 'paused' ? (
            <button
              onClick={handleResumeJob}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Play className="w-5 h-5" />
              <span>Resume</span>
            </button>
          ) : null}

          <button
            onClick={handleDeleteJob}
            className="btn btn-danger flex items-center space-x-2"
          >
            <Trash2 className="w-5 h-5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Job Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
            <Calendar className="w-5 h-5" />
            <span>Basic Information</span>
          </h2>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Description</p>
              <p className="text-gray-900">{job.description || 'No description'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Job ID</p>
              <p className="text-gray-900 font-mono text-sm">{job.job_id}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="text-gray-900">{formatDate(job.created_at)}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Updated</p>
              <p className="text-gray-900">{formatDate(job.updated_at)}</p>
            </div>
          </div>
        </div>

        {/* Schedule Information */}
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
            <Clock className="w-5 h-5" />
            <span>Schedule Information</span>
          </h2>

          <div className="space-y-3">
            {job.cron_expression && (
              <div>
                <p className="text-sm text-gray-600">Cron Expression</p>
                <p className="text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded">
                  {job.cron_expression}
                </p>
              </div>
            )}

            {job.scheduled_time && (
              <div>
                <p className="text-sm text-gray-600">Scheduled Time</p>
                <p className="text-gray-900">{formatDate(job.scheduled_time)}</p>
              </div>
            )}

            {job.next_run && (
              <div>
                <p className="text-sm text-gray-600">Next Run</p>
                <p className="text-gray-900">
                  {formatDate(job.next_run)}
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatRelativeTime(job.next_run)})
                  </span>
                </p>
              </div>
            )}

            {job.last_executed_at && (
              <div>
                <p className="text-sm text-gray-600">Last Executed</p>
                <p className="text-gray-900">
                  {formatDate(job.last_executed_at)}
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatRelativeTime(job.last_executed_at)})
                  </span>
                </p>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-600">Timeout</p>
              <p className="text-gray-900">{job.timeout_seconds} seconds</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payload */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
          <Code className="w-5 h-5" />
          <span>Payload</span>
        </h2>

        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
          <code className="text-sm">
            {JSON.stringify(job.payload, null, 2)}
          </code>
        </pre>
      </div>

      {/* Execution Statistics */}
      {(job.execution_count > 0 || job.success_count > 0 || job.failure_count > 0) && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Execution Statistics</h2>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Executions</p>
              <p className="text-3xl font-bold text-gray-900">{job.execution_count || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Successful</p>
              <p className="text-3xl font-bold text-green-600">{job.success_count || 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-600">{job.failure_count || 0}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetail;