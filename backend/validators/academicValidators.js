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

module.exports = {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema
};
