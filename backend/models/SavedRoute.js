/**
 * SavedRoute Domain Model
 *
 * Represents a student's bookmarked frequent commute route shortcut.
 */

const { z } = require('zod');

const savedRouteSchema = z.object({
  id: z.string().min(1, 'Route ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  name: z.string().min(2).max(100),
  origin: z.string().min(2).max(150),
  destination: z.string().min(2).max(150),
  preferred_mode: z.string().default('balanced'),
  max_budget: z.number().int().min(0).max(2000).default(100),
  summary: z.string().default(''),
  tags: z.array(z.string()).default([]),
  created_at: z.number().int().positive().default(() => Date.now())
});

class SavedRoute {
  constructor(data) {
    const validated = savedRouteSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `route-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new SavedRoute({
      ...input,
      id,
      created_at: input.created_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    let tags = [];
    if (typeof row.tags === 'string') {
      try {
        tags = JSON.parse(row.tags);
      } catch (e) {
        tags = [];
      }
    } else if (Array.isArray(row.tags)) {
      tags = row.tags;
    }

    return new SavedRoute({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      origin: row.origin,
      destination: row.destination,
      preferred_mode: row.preferred_mode || 'balanced',
      max_budget: Number(row.max_budget || 100),
      summary: row.summary || '',
      tags,
      created_at: Number(row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      name: this.name,
      origin: this.origin,
      destination: this.destination,
      preferred_mode: this.preferred_mode,
      max_budget: this.max_budget,
      summary: this.summary,
      tags: JSON.stringify(this.tags),
      created_at: this.created_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      name: this.name,
      origin: this.origin,
      destination: this.destination,
      preferred_mode: this.preferred_mode,
      max_budget: this.max_budget,
      summary: this.summary,
      tags: this.tags,
      created_at: this.created_at
    };
  }
}

module.exports = {
  SavedRoute,
  savedRouteSchema
};
