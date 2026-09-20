const { z } = require('zod');
const { db } = require('../db/database');

const feedbackSchema = z.object({
  recommendation_id: z.string().optional().default(''),
  is_useful: z.boolean(),
  tags: z.array(z.string()).optional().default([]),
  comment: z.string().optional().default('')
});

function submitFeedback(req, res) {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { recommendation_id, is_useful, tags, comment } = parsed.data;
    const id = `fb-${Date.now()}`;
    db.prepare(`
      INSERT INTO feedback (id, recommendation_id, is_useful, tags, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, recommendation_id, is_useful ? 1 : 0, JSON.stringify(tags), comment, Date.now());

    res.status(201).json({ success: true, message: 'Thank you for your student feedback!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  submitFeedback,
  feedbackSchema
};
