/**
 * Feedback Request Validation Schemas
 */

const { z } = require('zod');

const submitFeedbackSchema = z.object({
  recommendation_id: z.string().trim().max(100).optional().default(''),
  is_useful: z.boolean({
    required_error: 'is_useful boolean flag is required'
  }),
  tags: z.array(z.string().trim().min(1).max(50)).max(10, 'Maximum 10 feedback tags allowed').optional().default([]),
  comment: z.string().trim().max(1000, 'Comment cannot exceed 1000 characters').optional().default('')
});

const updateFeedbackSchema = z.object({
  is_useful: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10, 'Maximum 10 feedback tags allowed').optional(),
  comment: z.string().trim().max(1000, 'Comment cannot exceed 1000 characters').optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

module.exports = {
  submitFeedbackSchema,
  updateFeedbackSchema
};
