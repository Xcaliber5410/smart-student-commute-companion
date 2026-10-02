/**
 * Student Search Request Validation Schemas
 *
 * Provides schema validation and normalization for cross-entity unified student search requests.
 */

const { z } = require('zod');

const VALID_SEARCHABLE_TYPES = [
  'course',
  'courses',
  'subject',
  'subjects',
  'assignment',
  'assignments',
  'task',
  'tasks',
  'calendar_event',
  'calendar_events',
  'calendar',
  'event',
  'events',
  'study_session',
  'study_sessions',
  'session',
  'sessions',
  'study',
  'goal',
  'goals',
  'saved_route',
  'saved_routes',
  'route',
  'routes',
  'schedule',
  'schedules',
  'commute_schedule',
  'commute_schedules',
  'notification',
  'notifications',
  'reminder',
  'reminders'
];

const studentSearchQuerySchema = z.object({
  q: z.string().trim().max(200, 'Search query cannot exceed 200 characters').optional(),
  query: z.string().trim().max(200, 'Search query cannot exceed 200 characters').optional(),
  types: z.union([
    z.string().trim(),
    z.array(z.string().trim())
  ]).optional(),
  type: z.string().trim().optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20),
  offset: z.coerce
    .number()
    .int('Offset must be an integer')
    .min(0, 'Offset cannot be negative')
    .max(1000, 'Offset cannot exceed 1000')
    .optional()
    .default(0),
  courseId: z.string().trim().optional(),
  course_id: z.string().trim().optional(),
  status: z.string().trim().optional()
});

module.exports = {
  VALID_SEARCHABLE_TYPES,
  studentSearchQuerySchema
};
