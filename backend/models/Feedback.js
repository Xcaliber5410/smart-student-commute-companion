/**
 * Feedback Model
 *
 * Represents student feedback and rating for a recommended commute plan.
 */

const { z } = require('zod');

const feedbackSchema = z.object({
  id: z.string().min(1),
  recommendation_id: z.string().default(''),
  is_useful: z.boolean(),
  tags: z.array(z.string()).default([]),
  comment: z.string().max(1000).default(''),
  created_at: z.number().int().positive().default(() => Date.now())
});

class Feedback {
  constructor(data) {
    const validated = feedbackSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `fb-${now}`;
    return new Feedback({
      ...input,
      id,
      created_at: input.created_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;

    let parsedTags = [];
    if (typeof row.tags === 'string' && row.tags.trim() !== '') {
      try {
        parsedTags = JSON.parse(row.tags);
      } catch (e) {
        parsedTags = [];
      }
    } else if (Array.isArray(row.tags)) {
      parsedTags = row.tags;
    }

    return new Feedback({
      id: row.id,
      recommendation_id: row.recommendation_id || '',
      is_useful: Boolean(row.is_useful),
      tags: parsedTags,
      comment: row.comment || '',
      created_at: Number(row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      recommendation_id: this.recommendation_id,
      is_useful: this.is_useful ? 1 : 0,
      tags: JSON.stringify(this.tags),
      comment: this.comment,
      created_at: this.created_at
    };
  }
}

module.exports = {
  Feedback,
  feedbackSchema
};
