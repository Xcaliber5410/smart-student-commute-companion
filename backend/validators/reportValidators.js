/**
 * Disruption Report Request Validation Schemas
 */

const { z } = require('zod');

const createReportSchema = z.object({
  pseudonym: z.string().trim().min(2).max(50).optional().default('Student_Rider'),
  area: z.string().trim().min(2, 'Area is required').max(100),
  route_name: z.string().trim().max(100).optional().default('General Corridor'),
  route_id: z.string().trim().max(100).optional().default(''),
  mode: z.enum(['train', 'metro', 'bus', 'auto', 'walk'], {
    errorMap: () => ({ message: "Mode must be one of: 'train', 'metro', 'bus', 'auto', 'walk'" })
  }),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(250, 'Message cannot exceed 250 characters'),
  impact: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: "Impact must be one of: 'low', 'medium', 'high'" })
  }).optional().default('medium'),
  durationObservedMinutes: z.coerce.number().int().min(5, 'Duration must be at least 5 minutes').max(720, 'Duration cannot exceed 12 hours').optional().default(60)
});

const updateReportSchema = z.object({
  status: z.enum(['active', 'expired', 'resolved'], {
    errorMap: () => ({ message: "Status must be 'active', 'expired', or 'resolved'" })
  }).optional(),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(250).optional(),
  impact: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: "Impact must be one of: 'low', 'medium', 'high'" })
  }).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const reportFilterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mode: z.enum(['train', 'metro', 'bus', 'auto', 'walk']).optional(),
  area: z.string().trim().max(100).optional(),
  impact: z.enum(['low', 'medium', 'high']).optional()
});

module.exports = {
  createReportSchema,
  updateReportSchema,
  reportFilterQuerySchema
};
