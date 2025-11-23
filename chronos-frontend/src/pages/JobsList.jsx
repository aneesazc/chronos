import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, Play, Pause, Trash2, Eye } from 'lucide-react';
import { jobService } from '../services/jobService';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { formatDate, formatRelativeTime, getStatusColor, getJobTypeLabel } from '../utils/helpers';

const JobsList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });

  useEffect(() => {
    loadJobs();
  }, [pagination.page, statusFilter, jobTypeFilter]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(statusFilter && { status: statusFilter }),
        ...(jobTypeFilter && { job_type: jobTypeFilter }),
      };

      const response = await jobService.getJobs(params);
      setJobs(response.data.jobs || []);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (error) {
      toast.error('Failed to load jobs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseJob = async (jobId, e) => {
    e.preventDefault();
    try {
      await jobService.pauseJob(jobId);
      toast.success('Job paused successfully');
      loadJobs();
    } catch (error) {
      toast.error('Failed to pause job');
    }
  };

  const handleResumeJob = async (jobId, e) => {
    e.preventDefault();
    try {
      await jobService.resumeJob(jobId);
      toast.success('Job resumed successfully');
      loadJobs();
    } catch (error) {
      toast.error('Failed to resume job');
    }
  };

  const handleDeleteJob = async (jobId, e) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      await jobService.deleteJob(jobId);
      toast.success('Job deleted successfully');
      loadJobs();
    } catch (error) {
      toast.error('Failed to delete job');
    }
  };

  const handleExecuteJob = async (jobId, e) => {
    e.preventDefault();
    try {
      await jobService.executeJob(jobId);
      toast.success('Job execution triggered');
    } catch (error) {
      toast.error('Failed to execute job');
    }
  };

  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.description && job.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600 mt-1">Manage all your scheduled jobs</p>
        </div>
        <Link to="/jobs/create" className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>Create Job</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input pl-10"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Job Type Filter */}
          <select
            value={jobTypeFilter}
            onChange={(e) => setJobTypeFilter(e.target.value)}
            className="input"
          >
            <option value="">All Types</option>
            <option value="one-time">One-time</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>
      </div>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 text-lg mb-4">No jobs found</p>
          <Link to="/jobs/create" className="btn btn-primary inline-flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Create Your First Job</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {filteredJobs.map((job) => {
              const jobId = job.job_id || job.id; // Handle both field names
              return (
              <div key={jobId} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  {/* Job Info */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Link
                        to={`/jobs/${jobId}`}
                        className="text-xl font-semibold text-gray-900 hover:text-primary-600"
                      >
                        {job.name}
                      </Link>
                      <span className={`badge ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="badge badge-gray">
                        {getJobTypeLabel(job.job_type)}
                      </span>
                    </div>

                    {job.description && (
                      <p className="text-gray-600 mb-3">{job.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      {job.cron_expression && (
                        <div>
                          <span className="font-medium">Schedule:</span> {job.cron_expression}
                        </div>
                      )}
                      {job.next_run && (
                        <div>
                          <span className="font-medium">Next run:</span>{' '}
                          {formatRelativeTime(job.next_run)}
                        </div>
                      )}
                      {job.last_executed_at && (
                        <div>
                          <span className="font-medium">Last run:</span>{' '}
                          {formatRelativeTime(job.last_executed_at)}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Created:</span>{' '}
                        {formatDate(job.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 ml-4">
                    <Link
                      to={`/jobs/${jobId}`}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-5 h-5" />
                    </Link>

                    {job.status === 'active' ? (
                      <button
                        onClick={(e) => handlePauseJob(jobId, e)}
                        className="p-2 text-gray-600 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                        title="Pause Job"
                      >
                        <Pause className="w-5 h-5" />
                      </button>
                    ) : job.status === 'paused' ? (
                      <button
                        onClick={(e) => handleResumeJob(jobId, e)}
                        className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Resume Job"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                    ) : null}

                    <button
                      onClick={(e) => handleExecuteJob(jobId, e)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Execute Now"
                    >
                      <Play className="w-5 h-5" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteJob(jobId, e)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Job"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-6">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-gray-600">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.total_pages}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default JobsList;