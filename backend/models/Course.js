/**
 * Course Domain Model
 *
 * Represents an academic subject/course enrolled by a student.
 */

const { z } = require('zod');

const courseSchema = z.object({
  id: z.string().min(1, 'Course ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  name: z.string().min(2, 'Course name must have at least 2 characters').max(100),
  code: z.string().max(20).nullable().default(null),
  instructor: z.string().max(100).nullable().default(null),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code').default('#4F46E5'),
  credits: z.number().int().min(0).max(30).default(3),
  archived: z.number().int().min(0).max(1).default(0),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class Course {
  constructor(data) {
    const validated = courseSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `course-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new Course({
      ...input,
      id,
      code: input.code || null,
      instructor: input.instructor || null,
      color: input.color || '#4F46E5',
      credits: input.credits !== undefined ? Number(input.credits) : 3,
      archived: input.archived ? 1 : 0,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new Course({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      code: row.code || null,
      instructor: row.instructor || null,
      color: row.color || '#4F46E5',
      credits: Number(row.credits !== undefined ? row.credits : 3),
      archived: row.archived ? 1 : 0,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      name: this.name,
      code: this.code,
      instructor: this.instructor,
      color: this.color,
      credits: this.credits,
      archived: this.archived,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      name: this.name,
      code: this.code,
      instructor: this.instructor,
      color: this.color,
      credits: this.credits,
      archived: Boolean(this.archived),
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  Course,
  courseSchema
};
