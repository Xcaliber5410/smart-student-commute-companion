/**
 * StudentProfile Domain Model
 *
 * Represents an authenticated student's personalized commute preferences and default routes.
 */

const { z } = require('zod');

const studentProfileSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  home_area: z.string().max(100).default(''),
  default_college: z.string().max(150).default(''),
  preferred_modes: z.array(z.string()).default(['train', 'metro', 'bus', 'auto', 'walk']),
  walking_tolerance_minutes: z.number().int().min(5).max(60).default(20),
  max_budget_rupees: z.number().int().min(0).max(2000).default(100),
  default_arrival_time: z.string().default('09:00'),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudentProfile {
  constructor(data) {
    const validated = studentProfileSchema.parse(data);
    Object.assign(this, validated);
  }

  static fromRow(row) {
    if (!row) return null;
    let preferredModes = ['train', 'metro', 'bus', 'auto', 'walk'];
    if (typeof row.preferred_modes === 'string') {
      try {
        preferredModes = JSON.parse(row.preferred_modes);
      } catch (e) {
        preferredModes = ['train', 'metro', 'bus', 'auto', 'walk'];
      }
    } else if (Array.isArray(row.preferred_modes)) {
      preferredModes = row.preferred_modes;
    }

    return new StudentProfile({
      user_id: row.user_id,
      home_area: row.home_area || '',
      default_college: row.default_college || '',
      preferred_modes: preferredModes,
      walking_tolerance_minutes: Number(row.walking_tolerance_minutes || 20),
      max_budget_rupees: Number(row.max_budget_rupees || 100),
      default_arrival_time: row.default_arrival_time || '09:00',
      created_at: Number(row.created_at || Date.now()),
      updated_at: Number(row.updated_at || Date.now())
    });
  }

  toRow() {
    return {
      user_id: this.user_id,
      home_area: this.home_area,
      default_college: this.default_college,
      preferred_modes: JSON.stringify(this.preferred_modes),
      walking_tolerance_minutes: this.walking_tolerance_minutes,
      max_budget_rupees: this.max_budget_rupees,
      default_arrival_time: this.default_arrival_time,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      user_id: this.user_id,
      home_area: this.home_area,
      default_college: this.default_college,
      preferred_modes: this.preferred_modes,
      walking_tolerance_minutes: this.walking_tolerance_minutes,
      max_budget_rupees: this.max_budget_rupees,
      default_arrival_time: this.default_arrival_time,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = {
  StudentProfile,
  studentProfileSchema
};
