import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, X } from 'lucide-react';
import { jobService } from '../services/jobService';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { validateCronExpression } from '../utils/helpers';

const CreateJob = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    job_type: 'one-time',
    schedule_type: 'immediate',
    scheduled_time: '',
    cron_expression: '',
    payload: '{}',
    timeout_seconds: 300,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast.error('Job name is required');
      return;
    }

    if (formData.job_type === 'recurring' && formData.schedule_type === 'cron') {
      if (!validateCronExpression(formData.cron_expression)) {
        toast.error('Invalid cron expression');
        return;
      }
    }

    if (formData.schedule_type === 'scheduled' && !formData.scheduled_time) {
      toast.error('Scheduled time is required');
      return;
    }

    // Validate JSON payload
    try {
      JSON.parse(formData.payload);
    } catch (error) {
      toast.error('Invalid JSON payload');
      return;
    }

    setLoading(true);

    try {
      const jobData = {
        name: formData.name,
        description: formData.description,
        job_type: formData.job_type,
        schedule_type: formData.schedule_type,
        timeout_seconds: parseInt(formData.timeout_seconds),
        payload: JSON.parse(formData.payload),
      };

      if (formData.schedule_type === 'scheduled') {
        jobData.scheduled_time = new Date(formData.scheduled_time).toISOString();
      }

      if (formData.schedule_type === 'cron') {
        jobData.cron_expression = formData.cron_expression;
      }

      const response = await jobService.createJob(jobData);
      toast.success('Job created successfully!');
      // Handle both 'job_id' and 'id' from backend response
      const jobId = response.data.job_id || response.data.id;
      navigate(`/jobs/${jobId}`);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create job';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const cronExamples = [
    { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every 30 minutes', value: '*/30 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'First day of month', value: '0 0 1 * *' },
    { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create New Job</h1>
        <p className="text-gray-600 mt-1">Schedule a new job for execution</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Job Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Job Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="input"
            placeholder="Weekly Newsletter"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="input"
            rows="3"
            placeholder="Send weekly newsletter to subscribers"
          />
        </div>

        {/* Job Type */}
        <div>
          <label htmlFor="job_type" className="block text-sm font-medium text-gray-700 mb-1">
            Job Type <span className="text-red-500">*</span>
          </label>
          <select
            id="job_type"
            name="job_type"
            value={formData.job_type}
            onChange={handleChange}
            className="input"
            required
          >
            <option value="one-time">One-time</option>
            <option value="recurring">Recurring</option>
          </select>
          <p className="mt-1 text-sm text-gray-500">
            One-time jobs run once, recurring jobs run repeatedly
          </p>
        </div>

        {/* Schedule Type */}
        <div>
          <label htmlFor="schedule_type" className="block text-sm font-medium text-gray-700 mb-1">
            Schedule Type <span className="text-red-500">*</span>
          </label>
          <select
            id="schedule_type"
            name="schedule_type"
            value={formData.schedule_type}
            onChange={handleChange}
            className="input"
            required
          >
            <option value="immediate">Immediate</option>
            <option value="scheduled">Scheduled</option>
            {formData.job_type === 'recurring' && <option value="cron">Cron</option>}
          </select>
        </div>

        {/* Scheduled Time (if schedule_type is 'scheduled') */}
        {formData.schedule_type === 'scheduled' && (
          <div>
            <label htmlFor="scheduled_time" className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              id="scheduled_time"
              name="scheduled_time"
              value={formData.scheduled_time}
              onChange={handleChange}
              className="input"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Select the date and time for job execution
            </p>
          </div>
        )}

        {/* Cron Expression (if schedule_type is 'cron') */}
        {formData.schedule_type === 'cron' && (
          <div>
            <label htmlFor="cron_expression" className="block text-sm font-medium text-gray-700 mb-1">
              Cron Expression <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="cron_expression"
              name="cron_expression"
              value={formData.cron_expression}
              onChange={handleChange}
              className="input font-mono"
              placeholder="0 9 * * 1"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Format: minute hour day month weekday
            </p>

            {/* Cron Examples */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {cronExamples.map((example, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, cron_expression: example.value }))}
                  className="text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                >
                  <div className="font-medium text-gray-900">{example.label}</div>
                  <div className="font-mono text-xs text-gray-600">{example.value}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Payload */}
        <div>
          <label htmlFor="payload" className="block text-sm font-medium text-gray-700 mb-1">
            Payload (JSON)
          </label>
          <textarea
            id="payload"
            name="payload"
            value={formData.payload}
            onChange={handleChange}
            className="input font-mono text-sm"
            rows="6"
            placeholder='{"key": "value"}'
          />
          <p className="mt-1 text-sm text-gray-500">
            Job configuration and parameters in JSON format
          </p>
        </div>

        {/* Timeout */}
        <div>
          <label htmlFor="timeout_seconds" className="block text-sm font-medium text-gray-700 mb-1">
            Timeout (seconds)
          </label>
          <input
            type="number"
            id="timeout_seconds"
            name="timeout_seconds"
            value={formData.timeout_seconds}
            onChange={handleChange}
            className="input"
            min="1"
            max="3600"
          />
          <p className="mt-1 text-sm text-gray-500">
            Maximum execution time (1-3600 seconds, default: 300)
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-4 pt-6 border-t">
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <X className="w-5 h-5" />
            <span>Cancel</span>
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary flex items-center space-x-2"
          >
            {loading ? (
              <Spinner size="sm" className="text-white" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Create Job</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateJob;