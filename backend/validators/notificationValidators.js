/**
 * Notification and Reminder Request Validation Schemas
 */

const { z } = require('zod');

const notificationFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  read: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val === 'true' || val === '1') return true;
      if (val === 'false' || val === '0') return false;
      return undefined;
    })
  ]).optional(),
  type: z.enum(['reminder', 'disruption', 'ride_group', 'system']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional()
});

const bulkReadNotificationSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one notification ID is required')
});

const createReminderSchema = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  message: z.string().max(500).optional().nullable(),
  scheduled_time: z.coerce.number().int().positive('scheduled_time must be positive epoch ms'),
  reminder_type: z.enum(['commute', 'class', 'ride_group', 'custom']).default('commute'),
  related_resource_type: z.string().max(50).optional().nullable(),
  related_resource_id: z.string().max(100).optional().nullable()
});

const updateReminderSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  message: z.string().max(500).optional().nullable(),
  scheduled_time: z.coerce.number().int().positive().optional(),
  reminder_type: z.enum(['commute', 'class', 'ride_group', 'custom']).optional()
});

const reminderFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['scheduled', 'triggered', 'completed', 'cancelled']).optional(),
  reminder_type: z.enum(['commute', 'class', 'ride_group', 'custom']).optional()
});

module.exports = {
  notificationFilterSchema,
  bulkReadNotificationSchema,
  createReminderSchema,
  updateReminderSchema,
  reminderFilterSchema
};
