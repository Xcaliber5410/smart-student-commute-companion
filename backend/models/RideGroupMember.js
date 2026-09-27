/**
 * RideGroupMember Domain Model
 *
 * Represents an authenticated student's membership in a "Travel Together" group.
 */

const { z } = require('zod');

const rideGroupMemberSchema = z.object({
  id: z.number().int().optional(),
  group_id: z.string().min(1, 'Group ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  role: z.enum(['creator', 'member']).default('member'),
  joined_at: z.number().int().positive().default(() => Date.now())
});

class RideGroupMember {
  constructor(data) {
    const validated = rideGroupMemberSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    return new RideGroupMember({
      ...input,
      joined_at: input.joined_at || Date.now()
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new RideGroupMember({
      id: row.id ? Number(row.id) : undefined,
      group_id: row.group_id,
      user_id: row.user_id,
      role: row.role || 'member',
      joined_at: Number(row.joined_at)
    });
  }

  toRow() {
    return {
      ...(this.id ? { id: this.id } : {}),
      group_id: this.group_id,
      user_id: this.user_id,
      role: this.role,
      joined_at: this.joined_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      group_id: this.group_id,
      user_id: this.user_id,
      role: this.role,
      joined_at: this.joined_at
    };
  }
}

module.exports = {
  RideGroupMember,
  rideGroupMemberSchema
};
