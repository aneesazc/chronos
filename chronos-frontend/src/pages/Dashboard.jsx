import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, PlayCircle, PauseCircle, CheckCircle, XCircle, Clock as ClockIcon } from 'lucide-react';
import { jobService } from '../services/jobService';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { formatRelativeTime, getStatusColor } from '../utils/helpers';

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    paused: 0,
    completed: 0,
    failed: 0,
  });
  const [upcomingJobs, setUpcomingJobs] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load all jobs to calculate stats
      const allJobsResponse = await jobService.getJobs({ limit: 100 });
      const allJobs = allJobsResponse.data.jobs || [];

      // Calculate stats
      const statsData = {
        total: allJobs.length,
        active: allJobs.filter(j => j.status === 'active').length,
        paused: allJobs.filter(j => j.status === 'paused').length,
        completed: allJobs.filter(j => j.status === 'completed').length,
        failed: allJobs.filter(j => j.status === 'failed').length,
      };
      setStats(statsData);

      // Load upcoming jobs
      const upcomingResponse = await jobService.getUpcomingJobs();
      setUpcomingJobs(upcomingResponse.data.jobs || []);

      // Get recent jobs (sorted by created date)
      const recentJobsResponse = await jobService.getJobs({ 
        limit: 5, 
        sort_by: 'created_at', 
        sort_order: 'desc' 
      });
      setRecentJobs(recentJobsResponse.data.jobs || []);

    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your scheduled jobs</p>
        </div>
        <Link to="/jobs/create" className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>Create Job</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard
          icon={Calendar}
          label="Total Jobs"
          value={stats.total}
          color="bg-blue-500"
        />
        <StatCard
          icon={PlayCircle}
          label="Active"
          value={stats.active}
          color="bg-green-500"
        />
        <StatCard
          icon={PauseCircle}
          label="Paused"
          value={stats.paused}
          color="bg-yellow-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Completed"
          value={stats.completed}
          color="bg-blue-500"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={stats.failed}
          color="bg-red-500"
        />
      </div>

      {/* Upcoming Jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Upcoming Jobs (Next 24 Hours)</h2>
          <ClockIcon className="w-5 h-5 text-gray-400" />
        </div>

        {upcomingJobs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No upcoming jobs in the next 24 hours</p>
        ) : (
          <div className="space-y-3">
            {upcomingJobs.map((job) => {
              const jobId = job.job_id || job.id;
              return (
              <Link
                key={jobId}
                to={`/jobs/${jobId}`}
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{job.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {job.description || 'No description'}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <span className={`badge ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatRelativeTime(job.next_run)}
                    </p>
                  </div>
                </div>
              </Link>
            );
            })}
          </div>
        )}
      </div>

      {/* Recent Jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Recent Jobs</h2>
          <Link to="/jobs" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            View All
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No jobs created yet</p>
        ) : (
          <div className="space-y-3">
            {recentJobs.map((job) => {
              const jobId = job.job_id || job.id;
              return (
              <Link
                key={jobId}
                to={`/jobs/${jobId}`}
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{job.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Created {formatRelativeTime(job.created_at)}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <span className={`badge ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{job.job_type}</p>
                  </div>
                </div>
              </Link>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;