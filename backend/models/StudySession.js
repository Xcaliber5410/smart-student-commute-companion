/**
 * StudySession Domain Model
 *
 * Represents a student's planned or completed academic study block.
 */

const { z } = require('zod');

const studySessionStatusEnum = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);

const studySessionSchema = z.object({
  id: z.string().min(1, 'Study session ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  course_id: z.string().nullable().default(null),
  assignment_id: z.string().nullable().default(null),
  goal_id: z.string().nullable().default(null),
  title: z.string().min(2, 'Title must have at least 2 characters').max(150),
  notes: z.string().nullable().default(null),
  planned_start_time: z.number().int().positive('planned_start_time must be a positive timestamp'),
  planned_duration_minutes: z.number().int().min(1, 'Duration must be at least 1 minute').max(1440, 'Duration cannot exceed 24 hours'),
  actual_duration_minutes: z.number().int().min(0).max(1440).nullable().default(null),
  status: studySessionStatusEnum.default('planned'),
  reminder_enabled: z.number().int().min(0).max(1).default(1),
  reminder_lead_time_minutes: z.number().int().min(0).max(43200).default(15), // Up to 30 days
  completed_at: z.number().int().nullable().default(null),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudySession {
  constructor(data) {
    const validated = studySessionSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `study-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new StudySession({
      ...input,
      id,
      course_id: input.course_id || null,
      assignment_id: input.assignment_id || null,
      goal_id: input.goal_id || null,
      notes: input.notes || null,
      actual_duration_minutes: input.actual_duration_minutes !== undefined ? input.actual_duration_minutes : null,
      status: input.status || 'planned',
      reminder_enabled: input.reminder_enabled !== undefined ? (input.reminder_enabled ? 1 : 0) : 1,
      reminder_lead_time_minutes: input.reminder_lead_time_minutes !== undefined ? Number(input.reminder_lead_time_minutes) : 15,
      completed_at: input.status === 'completed' ? (input.completed_at || now) : null,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new StudySession({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id || null,
      assignment_id: row.assignment_id || null,
      goal_id: row.goal_id || null,
      title: row.title,
      notes: row.notes || null,
      planned_start_time: Number(row.planned_start_time),
      planned_duration_minutes: Number(row.planned_duration_minutes),
      actual_duration_minutes: row.actual_duration_minutes ? Number(row.actual_duration_minutes) : null,
      status: row.status || 'planned',
      reminder_enabled: row.reminder_enabled ? 1 : 0,
      reminder_lead_time_minutes: Number(row.reminder_lead_time_minutes || 15),
      completed_at: row.completed_at ? Number(row.completed_at) : null,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  get plannedEndTime() {
    return this.planned_start_time + (this.planned_duration_minutes * 60000);
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      course_id: this.course_id,
      assignment_id: this.assignment_id,
      goal_id: this.goal_id,
      title: this.title,
      notes: this.notes,
      planned_start_time: this.planned_start_time,
      planned_duration_minutes: this.planned_duration_minutes,
      actual_duration_minutes: this.actual_duration_minutes,
      status: this.status,
      reminder_enabled: this.reminder_enabled,
      reminder_lead_time_minutes: this.reminder_lead_time_minutes,
      completed_at: this.completed_at,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      courseId: this.course_id,
      assignmentId: this.assignment_id,
      goalId: this.goal_id,
      title: this.title,
      notes: this.notes,
      plannedStartTime: this.planned_start_time,
      plannedDurationMinutes: this.planned_duration_minutes,
      plannedEndTime: this.plannedEndTime,
      actualDurationMinutes: this.actual_duration_minutes,
      status: this.status,
      reminderEnabled: Boolean(this.reminder_enabled),
      reminderLeadTimeMinutes: this.reminder_lead_time_minutes,
      completedAt: this.completed_at,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  StudySession,
  studySessionStatusEnum,
  studySessionSchema
};
