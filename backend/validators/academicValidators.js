/**
 * Academic Courses and Assignments Validation Schemas
 */

const { z } = require('zod');

const createCourseSchema = z.object({
  name: z.string().min(2, 'Course name must have at least 2 characters').max(100),
  code: z.string().max(20).optional().nullable(),
  instructor: z.string().max(100).optional().nullable(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code').optional(),
  credits: z.coerce.number().int().min(0).max(30).optional().default(3)
});

const updateCourseSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  code: z.string().max(20).optional().nullable(),
  instructor: z.string().max(100).optional().nullable(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code').optional(),
  credits: z.coerce.number().int().min(0).max(30).optional(),
  archived: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional()
});

const courseFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().max(100).optional(),
  archived: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val === 'true' || val === '1') return true;
      if (val === 'false' || val === '0') return false;
      return undefined;
    })
  ]).optional()
});

const createAssignmentSchema = z.object({
  course_id: z.string().max(100).optional().nullable(),
  title: z.string().min(2, 'Title must have at least 2 characters').max(150),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.coerce.number().int().positive('due_date must be a positive timestamp'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().default('pending'),
  reminder_enabled: z.union([
    z.boolean(),
    z.coerce.number().int()
  ]).optional().default(true),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional().default(1440)
});

const updateAssignmentSchema = z.object({
  course_id: z.string().max(100).optional().nullable(),
  title: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.coerce.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  reminder_enabled: z.union([
    z.boolean(),
    z.coerce.number().int()
  ]).optional(),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional()
});

const updateAssignmentStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled'])
});

const assignmentFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  course_id: z.string().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  due_date_from: z.coerce.number().int().positive().optional(),
  due_date_to: z.coerce.number().int().positive().optional(),
  overdue: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional(),
  upcoming: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional(),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['due_date_asc', 'due_date_desc', 'created_at', 'priority']).optional().default('due_date_asc')
});

module.exports = {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentFilterSchema
};
