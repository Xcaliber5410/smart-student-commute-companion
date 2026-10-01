/**
 * Goal Domain Model
 *
 * Represents an academic, personal, or skill goal for a student.
 * Enables tracking target dates, status, and measurable progress (0-100% or custom units).
 */

const { z } = require('zod');

const goalStatusEnum = z.enum(['in_progress', 'completed', 'cancelled', 'on_hold']);

const goalSchema = z.object({
  id: z.string().min(1, 'Goal ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  course_id: z.string().nullable().default(null),
  title: z.string().min(2, 'Goal title must have at least 2 characters').max(150),
  description: z.string().nullable().default(null),
  target_date: z.number().int().positive('target_date must be a positive timestamp').nullable().default(null),
  status: goalStatusEnum.default('in_progress'),
  progress: z.number().int().min(0, 'Progress cannot be negative').max(100, 'Progress cannot exceed 100').default(0),
  target_value: z.number().positive().nullable().default(null),
  current_value: z.number().min(0).default(0),
  unit: z.string().max(30).nullable().default(null),
  completed_at: z.number().int().nullable().default(null),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class Goal {
  constructor(data) {
    const validated = goalSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `goal-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const status = input.status || 'in_progress';
    const targetValue = input.target_value !== undefined && input.target_value !== null ? Number(input.target_value) : null;
    let currentValue = input.current_value !== undefined && input.current_value !== null ? Number(input.current_value) : 0;
    
    // Auto-calculate progress percentage if target_value is provided and progress is not explicitly given
    let progress = input.progress !== undefined ? Number(input.progress) : 0;
    if (input.progress === undefined && targetValue && targetValue > 0) {
      progress = Math.min(100, Math.max(0, Math.round((currentValue / targetValue) * 100)));
    }

    const isCompleted = status === 'completed' || progress >= 100;
    const finalStatus = isCompleted && status !== 'cancelled' ? 'completed' : status;
    const completedAt = finalStatus === 'completed' ? (input.completed_at || now) : null;

    return new Goal({
      ...input,
      id,
      course_id: input.course_id || null,
      description: input.description || null,
      target_date: input.target_date !== undefined && input.target_date !== null ? Number(input.target_date) : null,
      status: finalStatus,
      progress,
      target_value: targetValue,
      current_value: currentValue,
      unit: input.unit || null,
      completed_at: completedAt,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new Goal({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id || null,
      title: row.title,
      description: row.description || null,
      target_date: row.target_date ? Number(row.target_date) : null,
      status: row.status || 'in_progress',
      progress: Number(row.progress !== undefined ? row.progress : 0),
      target_value: row.target_value !== null && row.target_value !== undefined ? Number(row.target_value) : null,
      current_value: Number(row.current_value !== undefined ? row.current_value : 0),
      unit: row.unit || null,
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
      target_date: this.target_date,
      status: this.status,
      progress: this.progress,
      target_value: this.target_value,
      current_value: this.current_value,
      unit: this.unit,
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
      targetDate: this.target_date,
      status: this.status,
      progress: this.progress,
      targetValue: this.target_value,
      currentValue: this.current_value,
      unit: this.unit,
      completedAt: this.completed_at,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  updateProgress({ progress, currentValue, status }) {
    const now = Date.now();
    if (currentValue !== undefined && currentValue !== null) {
      this.current_value = Number(currentValue);
      if (this.target_value && this.target_value > 0 && progress === undefined) {
        this.progress = Math.min(100, Math.max(0, Math.round((this.current_value / this.target_value) * 100)));
      }
    }

    if (progress !== undefined && progress !== null) {
      this.progress = Math.min(100, Math.max(0, Number(progress)));
    }

    if (status) {
      this.status = status;
    } else if (this.progress >= 100) {
      this.status = 'completed';
    }

    if (this.status === 'completed' && !this.completed_at) {
      this.completed_at = now;
    } else if (this.status !== 'completed') {
      this.completed_at = null;
    }

    this.updated_at = now;
    return this;
  }
}

module.exports = {
  Goal,
  goalSchema,
  goalStatusEnum
};
