/**
 * RideGroup Model
 *
 * Represents a "Travel Together" carpooling or shared-commute coordination group.
 */

const { z } = require('zod');

const rideGroupSchema = z.object({
  id: z.string().min(1),
  creator_pseudonym: z.string().min(2).max(50),
  origin_area: z.string().min(2).max(100),
  destination_college: z.string().min(2).max(100),
  departure_time: z.string().min(2).max(30),
  mode: z.string().min(2).max(50),
  max_members: z.number().int().min(2).max(6).default(3),
  current_members: z.number().int().min(1).default(1),
  notes: z.string().max(500).default(''),
  created_at: z.number().int().positive().default(() => Date.now())
}).refine(data => data.current_members <= data.max_members, {
  message: 'Current members cannot exceed maximum group capacity',
  path: ['current_members']
});

class RideGroup {
  constructor(data) {
    const validated = rideGroupSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `grp-${now}-${Math.random().toString(36).substring(2, 6)}`;
    return new RideGroup({
      ...input,
      id,
      created_at: input.created_at || now,
      current_members: input.current_members || 1
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new RideGroup({
      id: row.id,
      creator_pseudonym: row.creator_pseudonym,
      origin_area: row.origin_area,
      destination_college: row.destination_college,
      departure_time: row.departure_time,
      mode: row.mode,
      max_members: Number(row.max_members),
      current_members: Number(row.current_members),
      notes: row.notes || '',
      created_at: Number(row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      creator_pseudonym: this.creator_pseudonym,
      origin_area: this.origin_area,
      destination_college: this.destination_college,
      departure_time: this.departure_time,
      mode: this.mode,
      max_members: this.max_members,
      current_members: this.current_members,
      notes: this.notes,
      created_at: this.created_at
    };
  }

  isFull() {
    return this.current_members >= this.max_members;
  }
}

module.exports = {
  RideGroup,
  rideGroupSchema
};
