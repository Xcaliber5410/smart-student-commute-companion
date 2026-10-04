/**
 * Study Plan and Planned Study Work Validation Schemas
 */

const { z } = require('zod');

const studyPlanStatusEnum = z.enum(['active', 'completed', 'archived']);
const studyPlanItemStatusEnum = z.enum(['planned', 'in_progress', 'completed', 'skipped']);
const studyPlanItemPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

// =========================================================================
// STUDY PLAN SCHEMAS
// =========================================================================

const createStudyPlanSchema = z.object({
  title: z.string().min(1, 'Title must not be empty').max(150, 'Title cannot exceed 150 characters'),
  description: z.string().max(1000).optional().nullable(),
  start_date: z.coerce.number().int().positive('start_date must be a positive timestamp').optional(),
  startDate: z.coerce.number().int().positive('startDate must be a positive timestamp').optional(),
  end_date: z.coerce.number().int().positive('end_date must be a positive timestamp').optional(),
  endDate: z.coerce.number().int().positive('endDate must be a positive timestamp').optional(),
  status: studyPlanStatusEnum.optional().default('active')
}).transform(data => {
  const sDate = data.start_date !== undefined ? data.start_date : data.startDate;
  const eDate = data.end_date !== undefined ? data.end_date : data.endDate;
  return {
    title: data.title.trim(),
    description: data.description !== undefined ? data.description : null,
    start_date: sDate,
    end_date: eDate,
    status: data.status || 'active'
  };
}).refine(data => {
  if (data.start_date === undefined || data.end_date === undefined) return false;
  return data.start_date <= data.end_date;
}, {
  message: 'start_date must be on or before end_date',
  path: ['end_date']
});

const updateStudyPlanSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  start_date: z.coerce.number().int().positive().optional(),
  startDate: z.coerce.number().int().positive().optional(),
  end_date: z.coerce.number().int().positive().optional(),
  endDate: z.coerce.number().int().positive().optional(),
  status: studyPlanStatusEnum.optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
}).transform(data => {
  const result = {};
  if (data.title !== undefined) result.title = data.title.trim();
  if (data.description !== undefined) result.description = data.description;
  if (data.start_date !== undefined) result.start_date = data.start_date;
  else if (data.startDate !== undefined) result.start_date = data.startDate;
  if (data.end_date !== undefined) result.end_date = data.end_date;
  else if (data.endDate !== undefined) result.end_date = data.endDate;
  if (data.status !== undefined) result.status = data.status;
  return result;
}).refine(data => {
  if (data.start_date !== undefined && data.end_date !== undefined) {
    return data.start_date <= data.end_date;
  }
  return true;
}, {
  message: 'start_date must be on or before end_date',
  path: ['end_date']
});

const studyPlanFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: studyPlanStatusEnum.optional(),
  start_date: z.coerce.number().int().positive().optional(),
  startDate: z.coerce.number().int().positive().optional(),
  end_date: z.coerce.number().int().positive().optional(),
  endDate: z.coerce.number().int().positive().optional()
}).transform(data => ({
  page: data.page,
  limit: data.limit,
  status: data.status,
  start_date: data.start_date || data.startDate,
  end_date: data.end_date || data.endDate
}));

// =========================================================================
// STUDY PLAN ITEM SCHEMAS (Planned Study Work)
// =========================================================================

const createStudyPlanItemSchema = z.object({
  plan_id: z.string().max(100).optional().nullable(),
  planId: z.string().max(100).optional().nullable(),
  course_id: z.string().max(100).optional().nullable(),
  courseId: z.string().max(100).optional().nullable(),
  assignment_id: z.string().max(100).optional().nullable(),
  assignmentId: z.string().max(100).optional().nullable(),
  goal_id: z.string().max(100).optional().nullable(),
  goalId: z.string().max(100).optional().nullable(),
  study_session_id: z.string().max(100).optional().nullable(),
  studySessionId: z.string().max(100).optional().nullable(),
  resource_id: z.string().max(100).optional().nullable(),
  resourceId: z.string().max(100).optional().nullable(),
  title: z.string().min(1, 'Title must not be empty').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(1000).optional().nullable(),
  planned_date: z.coerce.number().int().positive('planned_date must be a positive timestamp').optional(),
  plannedDate: z.coerce.number().int().positive('plannedDate must be a positive timestamp').optional(),
  duration_minutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute').max(1440, 'Duration cannot exceed 24 hours').optional(),
  durationMinutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute').max(1440, 'Duration cannot exceed 24 hours').optional(),
  priority: studyPlanItemPriorityEnum.optional().default('medium'),
  status: studyPlanItemStatusEnum.optional().default('planned'),
  order_index: z.coerce.number().int().optional().default(0),
  orderIndex: z.coerce.number().int().optional()
}).transform(data => {
  const pDate = data.planned_date !== undefined ? data.planned_date : data.plannedDate;
  const dur = data.duration_minutes !== undefined ? data.duration_minutes : data.durationMinutes;
  return {
    plan_id: data.plan_id !== undefined ? data.plan_id : (data.planId !== undefined ? data.planId : null),
    course_id: data.course_id !== undefined ? data.course_id : (data.courseId !== undefined ? data.courseId : null),
    assignment_id: data.assignment_id !== undefined ? data.assignment_id : (data.assignmentId !== undefined ? data.assignmentId : null),
    goal_id: data.goal_id !== undefined ? data.goal_id : (data.goalId !== undefined ? data.goalId : null),
    study_session_id: data.study_session_id !== undefined ? data.study_session_id : (data.studySessionId !== undefined ? data.studySessionId : null),
    resource_id: data.resource_id !== undefined ? data.resource_id : (data.resourceId !== undefined ? data.resourceId : null),
    title: data.title.trim(),
    description: data.description !== undefined ? data.description : null,
    planned_date: pDate,
    duration_minutes: dur,
    priority: data.priority || 'medium',
    status: data.status || 'planned',
    order_index: data.order_index !== undefined ? data.order_index : (data.orderIndex !== undefined ? data.orderIndex : 0)
  };
}).refine(data => data.planned_date !== undefined, {
  message: 'planned_date is required',
  path: ['planned_date']
}).refine(data => data.duration_minutes !== undefined, {
  message: 'duration_minutes is required',
  path: ['duration_minutes']
});

const updateStudyPlanItemSchema = z.object({
  plan_id: z.string().max(100).optional().nullable(),
  planId: z.string().max(100).optional().nullable(),
  course_id: z.string().max(100).optional().nullable(),
  courseId: z.string().max(100).optional().nullable(),
  assignment_id: z.string().max(100).optional().nullable(),
  assignmentId: z.string().max(100).optional().nullable(),
  goal_id: z.string().max(100).optional().nullable(),
  goalId: z.string().max(100).optional().nullable(),
  study_session_id: z.string().max(100).optional().nullable(),
  studySessionId: z.string().max(100).optional().nullable(),
  resource_id: z.string().max(100).optional().nullable(),
  resourceId: z.string().max(100).optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  planned_date: z.coerce.number().int().positive().optional(),
  plannedDate: z.coerce.number().int().positive().optional(),
  duration_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  priority: studyPlanItemPriorityEnum.optional(),
  status: studyPlanItemStatusEnum.optional(),
  order_index: z.coerce.number().int().optional(),
  orderIndex: z.coerce.number().int().optional(),
  completed_at: z.coerce.number().int().positive().optional().nullable(),
  completedAt: z.coerce.number().int().positive().optional().nullable()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
}).transform(data => {
  const result = {};
  if (data.plan_id !== undefined) result.plan_id = data.plan_id;
  else if (data.planId !== undefined) result.plan_id = data.planId;
  if (data.course_id !== undefined) result.course_id = data.course_id;
  else if (data.courseId !== undefined) result.course_id = data.courseId;
  if (data.assignment_id !== undefined) result.assignment_id = data.assignment_id;
  else if (data.assignmentId !== undefined) result.assignment_id = data.assignmentId;
  if (data.goal_id !== undefined) result.goal_id = data.goal_id;
  else if (data.goalId !== undefined) result.goal_id = data.goalId;
  if (data.study_session_id !== undefined) result.study_session_id = data.study_session_id;
  else if (data.studySessionId !== undefined) result.study_session_id = data.studySessionId;
  if (data.resource_id !== undefined) result.resource_id = data.resource_id;
  else if (data.resourceId !== undefined) result.resource_id = data.resourceId;
  if (data.title !== undefined) result.title = data.title.trim();
  if (data.description !== undefined) result.description = data.description;
  if (data.planned_date !== undefined) result.planned_date = data.planned_date;
  else if (data.plannedDate !== undefined) result.planned_date = data.plannedDate;
  if (data.duration_minutes !== undefined) result.duration_minutes = data.duration_minutes;
  else if (data.durationMinutes !== undefined) result.duration_minutes = data.durationMinutes;
  if (data.priority !== undefined) result.priority = data.priority;
  if (data.status !== undefined) result.status = data.status;
  if (data.order_index !== undefined) result.order_index = data.order_index;
  else if (data.orderIndex !== undefined) result.order_index = data.orderIndex;
  if (data.completed_at !== undefined) result.completed_at = data.completed_at;
  else if (data.completedAt !== undefined) result.completed_at = data.completedAt;
  return result;
});

const studyPlanItemFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  plan_id: z.string().optional(),
  planId: z.string().optional(),
  course_id: z.string().optional(),
  courseId: z.string().optional(),
  assignment_id: z.string().optional(),
  assignmentId: z.string().optional(),
  goal_id: z.string().optional(),
  goalId: z.string().optional(),
  study_session_id: z.string().optional(),
  studySessionId: z.string().optional(),
  resource_id: z.string().optional(),
  resourceId: z.string().optional(),
  status: studyPlanItemStatusEnum.optional(),
  priority: studyPlanItemPriorityEnum.optional(),
  start_date: z.coerce.number().int().positive().optional(),
  startDate: z.coerce.number().int().positive().optional(),
  end_date: z.coerce.number().int().positive().optional(),
  endDate: z.coerce.number().int().positive().optional()
}).transform(data => ({
  page: data.page,
  limit: data.limit,
  plan_id: data.plan_id || data.planId,
  course_id: data.course_id || data.courseId,
  assignment_id: data.assignment_id || data.assignmentId,
  goal_id: data.goal_id || data.goalId,
  study_session_id: data.study_session_id || data.studySessionId,
  resource_id: data.resource_id || data.resourceId,
  status: data.status,
  priority: data.priority,
  start_date: data.start_date || data.startDate,
  end_date: data.end_date || data.endDate
}));

module.exports = {
  studyPlanStatusEnum,
  studyPlanItemStatusEnum,
  studyPlanItemPriorityEnum,
  createStudyPlanSchema,
  updateStudyPlanSchema,
  studyPlanFilterSchema,
  createStudyPlanItemSchema,
  updateStudyPlanItemSchema,
  studyPlanItemFilterSchema
};
