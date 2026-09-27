/**
 * LiveReport Model
 *
 * Represents a real-time community-reported transit disruption.
 */

const { z } = require('zod');

const liveReportSchema = z.object({
  id: z.string().min(1),
  pseudonym: z.string().min(2).max(50).default('Student_Rider'),
  area: z.string().min(2, 'Area is required'),
  route_name: z.string().default('General Corridor'),
  route_id: z.string().default(''),
  mode: z.enum(['train', 'metro', 'bus', 'auto', 'walk']),
  message: z.string().min(5, 'Message must be at least 5 characters').max(250),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['active', 'expired', 'resolved']).default('active'),
  created_at: z.number().int().positive().default(() => Date.now()),
  expires_at: z.number().int().positive(),
  confirmation_count: z.number().int().min(0).default(0),
  contradiction_count: z.number().int().min(0).default(0)
});

class LiveReport {
  constructor(data) {
    const validated = liveReportSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const durationMinutes = input.durationObservedMinutes || 60;
    const expires_at = input.expires_at || (now + durationMinutes * 60 * 1000);
    const id = input.id || `rep-${now}-${Math.random().toString(36).substring(2, 6)}`;

    return new LiveReport({
      ...input,
      id,
      created_at: input.created_at || now,
      expires_at
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new LiveReport({
      id: row.id,
      pseudonym: row.pseudonym,
      area: row.area,
      route_name: row.route_name,
      route_id: row.route_id || '',
      mode: row.mode,
      message: row.message,
      impact: row.impact,
      status: row.status,
      created_at: Number(row.created_at),
      expires_at: Number(row.expires_at),
      confirmation_count: Number(row.confirmation_count || 0),
      contradiction_count: Number(row.contradiction_count || 0)
    });
  }

  toRow() {
    return {
      id: this.id,
      pseudonym: this.pseudonym,
      area: this.area,
      route_name: this.route_name,
      route_id: this.route_id,
      mode: this.mode,
      message: this.message,
      impact: this.impact,
      status: this.status,
      created_at: this.created_at,
      expires_at: this.expires_at,
      confirmation_count: this.confirmation_count,
      contradiction_count: this.contradiction_count
    };
  }

  isExpired(currentTime = Date.now()) {
    return this.status === 'expired' || currentTime >= this.expires_at;
  }

  toJSON() {
    return {
      id: this.id,
      pseudonym: this.pseudonym,
      area: this.area,
      route_name: this.route_name,
      route_id: this.route_id,
      mode: this.mode,
      message: this.message,
      impact: this.impact,
      status: this.status,
      created_at: this.created_at,
      expires_at: this.expires_at,
      confirmation_count: this.confirmation_count,
      contradiction_count: this.contradiction_count
    };
  }
}

module.exports = {
  LiveReport,
  liveReportSchema
};
