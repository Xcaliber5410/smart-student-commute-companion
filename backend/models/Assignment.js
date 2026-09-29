/**
 * Assignment Domain Model
 *
 * Represents an academic assignment, project, or course task for a student.
 */

const { z } = require('zod');

const assignmentStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
const assignmentPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

const assignmentSchema = z.object({
  id: z.string().min(1, 'Assignment ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  course_id: z.string().nullable().default(null),
  title: z.string().min(2, 'Title must have at least 2 characters').max(150),
  description: z.string().nullable().default(null),
  due_date: z.number().int().positive('due_date must be a positive timestamp'),
  priority: assignmentPriorityEnum.default('medium'),
  status: assignmentStatusEnum.default('pending'),
  reminder_enabled: z.number().int().min(0).max(1).default(1),
  reminder_lead_time_minutes: z.number().int().min(0).max(43200).default(1440), // Up to 30 days
  completed_at: z.number().int().nullable().default(null),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class Assignment {
  constructor(data) {
    const validated = assignmentSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `asgn-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new Assignment({
      ...input,
      id,
      course_id: input.course_id || null,
      description: input.description || null,
      priority: input.priority || 'medium',
      status: input.status || 'pending',
      reminder_enabled: input.reminder_enabled !== undefined ? (input.reminder_enabled ? 1 : 0) : 1,
      reminder_lead_time_minutes: input.reminder_lead_time_minutes !== undefined ? Number(input.reminder_lead_time_minutes) : 1440,
      completed_at: input.status === 'completed' ? (input.completed_at || now) : null,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new Assignment({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id || null,
      title: row.title,
      description: row.description || null,
      due_date: Number(row.due_date),
      priority: row.priority || 'medium',
      status: row.status || 'pending',
      reminder_enabled: row.reminder_enabled ? 1 : 0,
      reminder_lead_time_minutes: Number(row.reminder_lead_time_minutes || 1440),
      completed_at: row.completed_at ? Number(row.completed_at) : null,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      course_id: this.course_id,
      title: this.title,
      description: this.description,
      due_date: this.due_date,
      priority: this.priority,
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
      title: this.title,
      description: this.description,
      dueDate: this.due_date,
      priority: this.priority,
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
  Assignment,
  assignmentSchema,
  assignmentStatusEnum,
  assignmentPriorityEnum
};
