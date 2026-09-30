/**
 * Calendar Event Request Validation Schemas
 */

const { z } = require('zod');

const eventTypeEnum = z.enum([
  'lecture', 'lab', 'exam', 'study', 'deadline', 'extracurricular', 'personal'
]);

const createCalendarEventSchema = z.object({
  course_id: z.string().min(1).nullable().optional(),
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  description: z.string().max(1000).nullable().optional(),
  location: z.string().max(150).nullable().optional(),
  event_type: eventTypeEnum.default('lecture'),
  start_time: z.coerce.number().int().positive('start_time must be a positive timestamp'),
  end_time: z.coerce.number().int().positive('end_time must be a positive timestamp'),
  reminder_enabled: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional()
}).refine(data => data.start_time < data.end_time, {
  message: 'start_time must be strictly before end_time',
  path: ['end_time']
});

const updateCalendarEventSchema = z.object({
  course_id: z.string().min(1).nullable().optional(),
  title: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).nullable().optional(),
  location: z.string().max(150).nullable().optional(),
  event_type: eventTypeEnum.optional(),
  start_time: z.coerce.number().int().positive().optional(),
  end_time: z.coerce.number().int().positive().optional(),
  status: z.enum(['scheduled', 'cancelled']).optional(),
  reminder_enabled: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional()
}).refine(data => {
  if (data.start_time !== undefined && data.end_time !== undefined) {
    return data.start_time < data.end_time;
  }
  return true;
}, {
  message: 'start_time must be strictly before end_time',
  path: ['end_time']
});

const calendarEventFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  course_id: z.string().optional(),
  event_type: eventTypeEnum.optional(),
  status: z.enum(['scheduled', 'cancelled']).optional(),
  start_after: z.coerce.number().int().positive().optional(),
  end_before: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['start_time_asc', 'start_time_desc', 'created_at']).default('start_time_asc')
});

const calendarRangeQuerySchema = z.object({
  start: z.coerce.number().int().positive('start must be a positive epoch timestamp'),
  end: z.coerce.number().int().positive('end must be a positive epoch timestamp')
}).refine(data => data.start < data.end, {
  message: 'start must be strictly before end',
  path: ['end']
}).refine(data => (data.end - data.start) <= (90 * 86400000), {
  message: 'Date range cannot exceed 90 days',
  path: ['end']
});

const calendarUpcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1, 'days must be at least 1').max(30, 'days cannot exceed 30').default(7)
});

const calendarWorkloadQuerySchema = z.object({
  start: z.coerce.number().int().positive().optional(),
  end: z.coerce.number().int().positive().optional(),
  days: z.coerce.number().int().min(1, 'days must be at least 1').max(30, 'days cannot exceed 30').default(7)
}).refine(data => {
  if (data.start !== undefined && data.end !== undefined) {
    return data.start < data.end;
  }
  return true;
}, {
  message: 'start must be strictly before end',
  path: ['end']
});

const calendarConflictQuerySchema = z.object({
  start: z.coerce.number().int().positive().optional(),
  end: z.coerce.number().int().positive().optional(),
  days: z.coerce.number().int().min(1, 'days must be at least 1').max(60, 'days cannot exceed 60').default(14)
}).refine(data => {
  if (data.start !== undefined && data.end !== undefined) {
    return data.start < data.end;
  }
  return true;
}, {
  message: 'start must be strictly before end',
  path: ['end']
});

module.exports = {
  eventTypeEnum,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFilterSchema,
  calendarRangeQuerySchema,
  calendarUpcomingQuerySchema,
  calendarWorkloadQuerySchema,
  calendarConflictQuerySchema
};
