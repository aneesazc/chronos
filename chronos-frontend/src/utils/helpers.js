import { format, formatDistanceToNow } from 'date-fns';

export const formatDate = (date) => {
  if (!date) return 'N/A';
  return format(new Date(date), 'MMM dd, yyyy HH:mm');
};

export const formatRelativeTime = (date) => {
  if (!date) return 'N/A';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const getStatusColor = (status) => {
  const statusColors = {
    pending: 'badge-gray',
    active: 'badge-success',
    paused: 'badge-warning',
    completed: 'badge-info',
    failed: 'badge-danger',
    running: 'badge-info',
  };
  return statusColors[status] || 'badge-gray';
};

export const getJobTypeLabel = (jobType) => {
  const labels = {
    'one-time': 'One-time',
    recurring: 'Recurring',
  };
  return labels[jobType] || jobType;
};

export const getScheduleTypeLabel = (scheduleType) => {
  const labels = {
    immediate: 'Immediate',
    scheduled: 'Scheduled',
    cron: 'Cron',
  };
  return labels[scheduleType] || scheduleType;
};

export const validateCronExpression = (expression) => {
  // Basic cron validation
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }
  return true;
};

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
};