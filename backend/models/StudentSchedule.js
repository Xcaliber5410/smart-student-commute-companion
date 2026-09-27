/**
 * StudentSchedule Domain Model
 *
 * Represents a student's recurring daily commute routine or lecture travel schedule.
 */

const { z } = require('zod');

const studentScheduleSchema = z.object({
  id: z.string().min(1, 'Schedule ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  title: z.string().min(2).max(100),
  origin: z.string().min(2).max(150),
  destination: z.string().min(2).max(150),
  target_arrival_time: z.string().min(2).max(20),
  days_of_week: z.array(z.string()).default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
  reminder_enabled: z.union([z.boolean(), z.number().transform(n => n === 1)]).default(true),
  active: z.union([z.boolean(), z.number().transform(n => n === 1)]).default(true),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudentSchedule {
  constructor(data) {
    const validated = studentScheduleSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `sch-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new StudentSchedule({
      ...input,
      id,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    let days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (typeof row.days_of_week === 'string') {
      try {
        days = JSON.parse(row.days_of_week);
      } catch (e) {
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      }
    } else if (Array.isArray(row.days_of_week)) {
      days = row.days_of_week;
    }

    return new StudentSchedule({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      origin: row.origin,
      destination: row.destination,
      target_arrival_time: row.target_arrival_time,
      days_of_week: days,
      reminder_enabled: Boolean(row.reminder_enabled),
      active: Boolean(row.active),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      title: this.title,
      origin: this.origin,
      destination: this.destination,
      target_arrival_time: this.target_arrival_time,
      days_of_week: JSON.stringify(this.days_of_week),
      reminder_enabled: this.reminder_enabled ? 1 : 0,
      active: this.active ? 1 : 0,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      title: this.title,
      origin: this.origin,
      destination: this.destination,
      target_arrival_time: this.target_arrival_time,
      days_of_week: this.days_of_week,
      reminder_enabled: this.reminder_enabled,
      active: this.active,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = {
  StudentSchedule,
  studentScheduleSchema
};
