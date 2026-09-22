const { z } = require('zod');
const { feedbackRepository } = require('../repositories');
const { ValidationError } = require('../errors');

const feedbackSchema = z.object({
  recommendation_id: z.string().optional().default(''),
  is_useful: z.boolean(),
  tags: z.array(z.string()).optional().default([]),
  comment: z.string().optional().default('')
});

function submitFeedback(req, res, next) {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Validation failed', parsed.error.format()));
    }

    const { recommendation_id, is_useful, tags, comment } = parsed.data;
    const id = `fb-${Date.now()}`;
    feedbackRepository.create({
      id,
      recommendation_id,
      is_useful,
      tags,
      comment,
      created_at: Date.now()
    });

    res.status(201).json({ success: true, message: 'Thank you for your student feedback!' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitFeedback,
  feedbackSchema
};
