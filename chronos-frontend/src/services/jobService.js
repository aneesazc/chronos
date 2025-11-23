import api from './api';

export const jobService = {
  async createJob(jobData) {
    const response = await api.post('/jobs', jobData);
    return response.data;
  },

  async getJobs(params = {}) {
    const response = await api.get('/jobs', { params });
    return response.data;
  },

  async getJobById(jobId) {
    const response = await api.get(`/jobs/${jobId}`);
    return response.data;
  },

  async updateJob(jobId, updates) {
    const response = await api.patch(`/jobs/${jobId}`, updates);
    return response.data;
  },

  async deleteJob(jobId) {
    const response = await api.delete(`/jobs/${jobId}`);
    return response.data;
  },

  async pauseJob(jobId) {
    const response = await api.post(`/jobs/${jobId}/pause`);
    return response.data;
  },

  async resumeJob(jobId) {
    const response = await api.post(`/jobs/${jobId}/resume`);
    return response.data;
  },

  async executeJob(jobId) {
    const response = await api.post(`/jobs/${jobId}/execute`);
    return response.data;
  },

  async getUpcomingJobs() {
    const response = await api.get('/jobs/upcoming');
    return response.data;
  },
};