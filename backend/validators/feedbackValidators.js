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

module.exports = {
  submitFeedbackSchema
};
