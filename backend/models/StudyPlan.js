/**
 * StudyPlan Domain Model
 *
 * Represents an organized student study plan / schedule sprint over a defined date range.
 * Manages collections of planned study work items.
 */

const { z } = require('zod');

const studyPlanStatusEnum = z.enum(['active', 'completed', 'archived']);

const studyPlanSchema = z.object({
  id: z.string().min(1, 'Study plan ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  title: z.string().min(1, 'Study plan title must not be empty').max(150, 'Title cannot exceed 150 characters'),
  description: z.string().max(1000).nullable().default(null),
  start_date: z.number().int().positive('start_date must be a positive epoch timestamp'),
  end_date: z.number().int().positive('end_date must be a positive epoch timestamp'),
  status: studyPlanStatusEnum.default('active'),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
}).refine(data => data.start_date <= data.end_date, {
  message: 'start_date must be on or before end_date',
  path: ['end_date']
});

class StudyPlan {
  constructor(data) {
    const validated = studyPlanSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `plan-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const status = input.status || 'active';

    return new StudyPlan({
      ...input,
      id,
      description: input.description || null,
      start_date: Number(input.start_date !== undefined ? input.start_date : input.startDate),
      end_date: Number(input.end_date !== undefined ? input.end_date : input.endDate),
      status,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new StudyPlan({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description || null,
      start_date: Number(row.start_date),
      end_date: Number(row.end_date),
      status: row.status || 'active',
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      title: this.title,
      description: this.description,
      start_date: this.start_date,
      end_date: this.end_date,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      title: this.title,
      description: this.description,
      startDate: this.start_date,
      endDate: this.end_date,
      status: this.status,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  StudyPlan,
  studyPlanSchema,
  studyPlanStatusEnum
};
