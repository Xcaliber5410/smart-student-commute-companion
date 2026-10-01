/**
 * Student Goals Validation Schemas
 */

const { z } = require('zod');

const goalStatusEnum = z.enum(['in_progress', 'completed', 'cancelled', 'on_hold']);

const createGoalSchema = z.object({
  course_id: z.string().max(100).optional().nullable(),
  courseId: z.string().max(100).optional().nullable(),
  title: z.string().min(2, 'Goal title must have at least 2 characters').max(150),
  description: z.string().max(2000).optional().nullable(),
  target_date: z.coerce.number().int().positive('target_date must be a positive timestamp').optional().nullable(),
  targetDate: z.coerce.number().int().positive('targetDate must be a positive timestamp').optional().nullable(),
  status: goalStatusEnum.optional().default('in_progress'),
  progress: z.coerce.number().int().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100').optional(),
  target_value: z.coerce.number().positive('target_value must be greater than 0').optional().nullable(),
  targetValue: z.coerce.number().positive('targetValue must be greater than 0').optional().nullable(),
  current_value: z.coerce.number().min(0, 'current_value cannot be negative').optional().default(0),
  currentValue: z.coerce.number().min(0, 'currentValue cannot be negative').optional().default(0),
  unit: z.string().max(30).optional().nullable()
}).transform(data => ({
  course_id: data.course_id !== undefined ? data.course_id : (data.courseId !== undefined ? data.courseId : null),
  title: data.title.trim(),
  description: data.description !== undefined ? data.description : null,
  target_date: data.target_date !== undefined ? data.target_date : (data.targetDate !== undefined ? data.targetDate : null),
  status: data.status,
  progress: data.progress,
  target_value: data.target_value !== undefined ? data.target_value : (data.targetValue !== undefined ? data.targetValue : null),
  current_value: data.current_value !== undefined && data.current_value !== 0 ? data.current_value : (data.currentValue !== undefined ? data.currentValue : 0),
  unit: data.unit !== undefined ? data.unit : null
}));

const updateGoalSchema = z.object({
  course_id: z.string().max(100).optional().nullable(),
  courseId: z.string().max(100).optional().nullable(),
  title: z.string().min(2).max(150).optional(),
  description: z.string().max(2000).optional().nullable(),
  target_date: z.coerce.number().int().positive('target_date must be a positive timestamp').optional().nullable(),
  targetDate: z.coerce.number().int().positive('targetDate must be a positive timestamp').optional().nullable(),
  status: goalStatusEnum.optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  target_value: z.coerce.number().positive().optional().nullable(),
  targetValue: z.coerce.number().positive().optional().nullable(),
  current_value: z.coerce.number().min(0).optional(),
  currentValue: z.coerce.number().min(0).optional(),
  unit: z.string().max(30).optional().nullable()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
}).transform(data => {
  const result = {};
  if (data.course_id !== undefined) result.course_id = data.course_id;
  else if (data.courseId !== undefined) result.course_id = data.courseId;

  if (data.title !== undefined) result.title = data.title.trim();
  if (data.description !== undefined) result.description = data.description;
  if (data.target_date !== undefined) result.target_date = data.target_date;
  else if (data.targetDate !== undefined) result.target_date = data.targetDate;

  if (data.status !== undefined) result.status = data.status;
  if (data.progress !== undefined) result.progress = data.progress;
  if (data.target_value !== undefined) result.target_value = data.target_value;
  else if (data.targetValue !== undefined) result.target_value = data.targetValue;

  if (data.current_value !== undefined) result.current_value = data.current_value;
  else if (data.currentValue !== undefined) result.current_value = data.currentValue;

  if (data.unit !== undefined) result.unit = data.unit;
  return result;
});

const updateGoalProgressSchema = z.object({
  progress: z.coerce.number().int().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100').optional(),
  current_value: z.coerce.number().min(0, 'current_value cannot be negative').optional(),
  currentValue: z.coerce.number().min(0, 'currentValue cannot be negative').optional(),
  status: goalStatusEnum.optional()
}).refine(data => data.progress !== undefined || data.current_value !== undefined || data.currentValue !== undefined || data.status !== undefined, {
  message: 'At least one of progress, current_value, or status must be provided'
}).transform(data => ({
  progress: data.progress,
  current_value: data.current_value !== undefined ? data.current_value : data.currentValue,
  status: data.status
}));

const goalFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: goalStatusEnum.optional(),
  active: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional(),
  completed: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional(),
  overdue: z.union([
    z.boolean(),
    z.string().transform(v => v === 'true' || v === '1')
  ]).optional(),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  start_date: z.coerce.number().int().positive().optional(),
  startDate: z.coerce.number().int().positive().optional(),
  end_date: z.coerce.number().int().positive().optional(),
  endDate: z.coerce.number().int().positive().optional(),
  course_id: z.string().max(100).optional(),
  courseId: z.string().max(100).optional(),
  search: z.string().max(100).optional()
}).transform(data => ({
  page: data.page,
  limit: data.limit,
  status: data.status,
  active: data.active,
  completed: data.completed,
  overdue: data.overdue,
  from: data.from !== undefined ? data.from : (data.start_date !== undefined ? data.start_date : data.startDate),
  to: data.to !== undefined ? data.to : (data.end_date !== undefined ? data.end_date : data.endDate),
  course_id: data.course_id || data.courseId,
  search: data.search
}));

module.exports = {
  createGoalSchema,
  updateGoalSchema,
  updateGoalProgressSchema,
  goalFilterSchema,
  goalStatusEnum
};
