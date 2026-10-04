/**
 * StudyPlanItem Domain Model
 *
 * Represents an individual planned piece of study work (target date, duration, priority)
 * connected relationally to an optional Study Plan, Course, Assignment, Goal,
 * Study Session, or Study Resource.
 */

const { z } = require('zod');

const studyPlanItemStatusEnum = z.enum(['planned', 'in_progress', 'completed', 'skipped']);
const studyPlanItemPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

const studyPlanItemSchema = z.object({
  id: z.string().min(1, 'Item ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  plan_id: z.string().nullable().default(null),
  course_id: z.string().nullable().default(null),
  assignment_id: z.string().nullable().default(null),
  goal_id: z.string().nullable().default(null),
  study_session_id: z.string().nullable().default(null),
  resource_id: z.string().nullable().default(null),
  title: z.string().min(1, 'Title must not be empty').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(1000).nullable().default(null),
  planned_date: z.number().int().positive('planned_date must be a positive epoch timestamp'),
  duration_minutes: z.number().int().min(1, 'Duration must be at least 1 minute').max(1440, 'Duration cannot exceed 24 hours'),
  priority: studyPlanItemPriorityEnum.default('medium'),
  status: studyPlanItemStatusEnum.default('planned'),
  order_index: z.number().int().default(0),
  completed_at: z.number().int().nullable().default(null),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudyPlanItem {
  constructor(data) {
    const validated = studyPlanItemSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `plan-item-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const status = input.status || 'planned';
    const completedAt = status === 'completed'
      ? (input.completed_at !== undefined && input.completed_at !== null ? Number(input.completed_at) : now)
      : null;

    return new StudyPlanItem({
      ...input,
      id,
      plan_id: input.plan_id || input.planId || null,
      course_id: input.course_id || input.courseId || null,
      assignment_id: input.assignment_id || input.assignmentId || null,
      goal_id: input.goal_id || input.goalId || null,
      study_session_id: input.study_session_id || input.studySessionId || null,
      resource_id: input.resource_id || input.resourceId || null,
      description: input.description || null,
      planned_date: Number(input.planned_date !== undefined ? input.planned_date : input.plannedDate),
      duration_minutes: Number(input.duration_minutes !== undefined ? input.duration_minutes : input.durationMinutes),
      priority: input.priority || 'medium',
      status,
      order_index: input.order_index !== undefined ? Number(input.order_index) : (input.orderIndex !== undefined ? Number(input.orderIndex) : 0),
      completed_at: completedAt,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new StudyPlanItem({
      id: row.id,
      user_id: row.user_id,
      plan_id: row.plan_id || null,
      course_id: row.course_id || null,
      assignment_id: row.assignment_id || null,
      goal_id: row.goal_id || null,
      study_session_id: row.study_session_id || null,
      resource_id: row.resource_id || null,
      title: row.title,
      description: row.description || null,
      planned_date: Number(row.planned_date),
      duration_minutes: Number(row.duration_minutes),
      priority: row.priority || 'medium',
      status: row.status || 'planned',
      order_index: Number(row.order_index || 0),
      completed_at: row.completed_at ? Number(row.completed_at) : null,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  get isCompleted() {
    return this.status === 'completed';
  }

  isOverdue(now = Date.now()) {
    return !this.isCompleted && this.status !== 'skipped' && this.planned_date < now;
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      plan_id: this.plan_id,
      course_id: this.course_id,
      assignment_id: this.assignment_id,
      goal_id: this.goal_id,
      study_session_id: this.study_session_id,
      resource_id: this.resource_id,
      title: this.title,
      description: this.description,
      planned_date: this.planned_date,
      duration_minutes: this.duration_minutes,
      priority: this.priority,
      status: this.status,
      order_index: this.order_index,
      completed_at: this.completed_at,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      planId: this.plan_id,
      courseId: this.course_id,
      assignmentId: this.assignment_id,
      goalId: this.goal_id,
      studySessionId: this.study_session_id,
      resourceId: this.resource_id,
      title: this.title,
      description: this.description,
      plannedDate: this.planned_date,
      durationMinutes: this.duration_minutes,
      priority: this.priority,
      status: this.status,
      orderIndex: this.order_index,
      completedAt: this.completed_at,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  StudyPlanItem,
  studyPlanItemSchema,
  studyPlanItemStatusEnum,
  studyPlanItemPriorityEnum
};
