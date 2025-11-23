const { z } = require('zod');
const { isValidCronExpression } = require('./cronParser');
const logger = require('../config/logger');

/**
 * Validation schemas using Zod
 */
const schemas = {
  // User registration
  userRegister: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Please provide a valid email address')
      .toLowerCase()
      .trim(),
    password: z
      .string({
        required_error: 'Password is required',
      })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password is too long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
  }),

  // User login
  userLogin: z.object({
    email: z
      .string({
        required_error: 'Email is required',
      })
      .email('Please provide a valid email address'),
    password: z.string({
      required_error: 'Password is required',
    }),
  }),

  // Job creation
  jobCreate: z.object({
    name: z.string().min(1, 'Job name cannot be empty').max(255, 'Job name is too long'),
    description: z.string().max(1000).nullish(),
    job_type: z.enum(['one-time', 'recurring']),
    schedule_type: z.enum(['immediate', 'scheduled', 'cron']),
    scheduled_time: z.string().datetime().nullish(),
    cron_expression: z.string().nullish(),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
    timeout_seconds: z.number().int().min(1).max(3600).optional().default(300),
    max_retries: z.number().int().min(0).max(10).optional().default(3),
  }).refine(
    (data) => {
      // Validate scheduled jobs have scheduled_time
      if (data.schedule_type === 'scheduled' && !data.scheduled_time) {
        return false;
      }
      // Validate cron jobs have cron_expression
      if (data.schedule_type === 'cron' && !data.cron_expression) {
        return false;
      }
      // Validate immediate jobs don't have scheduled_time or cron
      if (data.schedule_type === 'immediate' && (data.scheduled_time || data.cron_expression)) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid schedule configuration',
    }
  ),

  // Job update
  jobUpdate: z
    .object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).nullable().optional(),
      cron_expression: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
      timeout_seconds: z.number().int().min(1).max(3600).optional(),
      status: z.enum(['active', 'paused']).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),

  // Job list query parameters
  jobListQuery: z.object({
    status: z.enum(['pending', 'active', 'paused', 'completed', 'failed']).optional(),
    job_type: z.enum(['one-time', 'recurring']).optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1))
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default('20'),
    sort_by: z
      .enum(['created_at', 'next_run', 'name', 'updated_at'])
      .default('created_at'),
    sort_order: z
      .string()
      .toLowerCase()
      .transform((val) => val.toUpperCase())
      .pipe(z.enum(['ASC', 'DESC']))
      .default('DESC'),
  }),

  // Execution list query parameters
  executionListQuery: z.object({
    status: z.enum(['running', 'success', 'failed', 'timeout']).optional(),
    from_date: z
      .string()
      .datetime()
      .transform((str) => new Date(str))
      .optional(),
    to_date: z
      .string()
      .datetime()
      .transform((str) => new Date(str))
      .optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1))
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default('20'),
  }),

  // Dashboard stats query
  dashboardStatsQuery: z.object({
    from_date: z
      .string()
      .datetime()
      .transform((str) => new Date(str))
      .optional(),
    to_date: z
      .string()
      .datetime()
      .transform((str) => new Date(str))
      .optional(),
  }),

  // UUID parameter
  uuidParam: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),
};

/**
 * Validate data against a schema
 * @param {Object} data - Data to validate
 * @param {ZodSchema} schema - Zod schema
 * @returns {Object} { success, data, error }
 */
function validate(data, schema) {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    return {
      success: false,
      data: null,
      error: result.error,
    };
  }
  
  return {
    success: true,
    data: result.data,
    error: null,
  };
}

/**
 * Validation middleware factory for Express
 * @param {ZodSchema} schema - Zod schema
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
function validationMiddleware(schema, source = 'body') {
  return (req, res, next) => {
    try {
      if (!schema) {
        logger.error('Validation schema is undefined');
        return res.status(500).json({
          error: true,
          message: 'Validation schema is not defined',
        });
      }

      logger.debug('Validating request:', {
        source,
        data: req[source],
      });

      const result = validate(req[source], schema);

      if (!result.success) {
        logger.warn('Validation failed:', {
          errors: result.error.errors,
        });

        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: true,
          message: 'Validation error',
          errors,
        });
      }

      // Replace request data with validated and transformed data
      req[source] = result.data;
      next();
    } catch (error) {
      logger.error('Validation middleware error:', {
        error: error.message,
        stack: error.stack,
        source,
        data: req[source],
      });

      return res.status(500).json({
        error: true,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid
 */
function isValidUUID(uuid) {
  const uuidSchema = z.string().uuid();
  return uuidSchema.safeParse(uuid).success;
}

/**
 * Sanitize string (remove dangerous characters)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
  return str.replace(/[<>]/g, '');
}

/**
 * Create a partial schema from an existing schema (all fields optional)
 * Useful for update operations
 * @param {ZodSchema} schema - Original schema
 * @returns {ZodSchema} Partial schema
 */
function createPartialSchema(schema) {
  return schema.partial();
}

module.exports = {
  schemas,
  validate,
  validationMiddleware,
  isValidEmail,
  isValidUUID,
  sanitizeString,
  createPartialSchema,
  z, // Export z for custom schemas if needed
};