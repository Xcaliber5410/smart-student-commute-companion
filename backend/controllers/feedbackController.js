const { z } = require('zod');
const { feedbackService } = require('../services');
const { ValidationError } = require('../errors');
const { success, created } = require('../utils/apiResponse');

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

    feedbackService.submitFeedback(parsed.data);

    return created(res, { message: 'Thank you for your student feedback!' });
  } catch (err) {
    next(err);
  }
}

function getFeedback(req, res, next) {
  try {
    const result = feedbackService.listFeedback(req.query);
    return success(res, { ...result });
  } catch (err) {
    next(err);
  }
}

function updateFeedback(req, res, next) {
  try {
    const { id } = req.params;
    const updated = feedbackService.updateFeedback(id, req.body);
    return success(res, { message: 'Feedback updated successfully', feedback: updated });
  } catch (err) {
    next(err);
  }
}

function deleteFeedback(req, res, next) {
  try {
    const { id } = req.params;
    feedbackService.deleteFeedback(id);
    return success(res, { message: 'Feedback deleted successfully', id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitFeedback,
  getFeedback,
  updateFeedback,
  deleteFeedback,
  feedbackSchema
};
