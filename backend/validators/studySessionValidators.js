/**
 * Study Session Request Validation Schemas
 */

const { z } = require('zod');

const studySessionStatusEnum = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);

const createStudySessionSchema = z.object({
  course_id: z.string().min(1).nullable().optional(),
  courseId: z.string().min(1).nullable().optional(),
  assignment_id: z.string().min(1).nullable().optional(),
  assignmentId: z.string().min(1).nullable().optional(),
  goal_id: z.string().min(1).nullable().optional(),
  goalId: z.string().min(1).nullable().optional(),
  title: z.string().min(2, 'Title must be at least 2 characters').max(150),
  notes: z.string().max(1000).nullable().optional(),
  planned_start_time: z.coerce.number().int().positive('planned_start_time must be a positive timestamp'),
  planned_duration_minutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute').max(1440, 'Duration cannot exceed 24 hours'),
  reminder_enabled: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional()
}).transform(data => ({
  ...data,
  course_id: data.course_id !== undefined ? data.course_id : (data.courseId !== undefined ? data.courseId : null),
  assignment_id: data.assignment_id !== undefined ? data.assignment_id : (data.assignmentId !== undefined ? data.assignmentId : null),
  goal_id: data.goal_id !== undefined ? data.goal_id : (data.goalId !== undefined ? data.goalId : null)
}));

const updateStudySessionSchema = z.object({
  course_id: z.string().min(1).nullable().optional(),
  courseId: z.string().min(1).nullable().optional(),
  assignment_id: z.string().min(1).nullable().optional(),
  assignmentId: z.string().min(1).nullable().optional(),
  goal_id: z.string().min(1).nullable().optional(),
  goalId: z.string().min(1).nullable().optional(),
  title: z.string().min(2).max(150).optional(),
  notes: z.string().max(1000).nullable().optional(),
  planned_start_time: z.coerce.number().int().positive().optional(),
  planned_duration_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  actual_duration_minutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  status: studySessionStatusEnum.optional(),
  reminder_enabled: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  reminder_lead_time_minutes: z.coerce.number().int().min(0).max(43200).optional()
}).transform(data => {
  const result = { ...data };
  if (data.course_id !== undefined) result.course_id = data.course_id;
  else if (data.courseId !== undefined) result.course_id = data.courseId;

  if (data.assignment_id !== undefined) result.assignment_id = data.assignment_id;
  else if (data.assignmentId !== undefined) result.assignment_id = data.assignmentId;

  if (data.goal_id !== undefined) result.goal_id = data.goal_id;
  else if (data.goalId !== undefined) result.goal_id = data.goalId;

  delete result.courseId;
  delete result.assignmentId;
  delete result.goalId;
  return result;
});

const updateStudySessionStatusSchema = z.object({
  status: studySessionStatusEnum,
  actual_duration_minutes: z.coerce.number().int().min(0).max(1440).optional()
});

const studySessionFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  course_id: z.string().optional(),
  assignment_id: z.string().optional(),
  goal_id: z.string().optional(),
  status: studySessionStatusEnum.optional(),
  start_after: z.coerce.number().int().positive().optional(),
  end_before: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['time_asc', 'time_desc', 'created_at']).default('time_asc')
});

module.exports = {
  studySessionStatusEnum,
  createStudySessionSchema,
  updateStudySessionSchema,
  updateStudySessionStatusSchema,
  studySessionFilterSchema
};
