/**
 * Reminder Domain Model
 *
 * Represents a student commute reminder or scheduled alert.
 */

const { z } = require('zod');

const reminderTypeEnum = z.enum(['commute', 'class', 'ride_group', 'assignment', 'custom']);
const reminderStatusEnum = z.enum(['scheduled', 'triggered', 'completed', 'cancelled']);

const reminderSchema = z.object({
  id: z.string().min(1, 'Reminder ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  title: z.string().min(1).max(150),
  message: z.string().max(500).nullable().optional(),
  scheduled_time: z.number().int().positive(),
  reminder_type: reminderTypeEnum.default('commute'),
  status: reminderStatusEnum.default('scheduled'),
  related_resource_type: z.string().max(50).nullable().optional(),
  related_resource_id: z.string().max(100).nullable().optional(),
  triggered_at: z.number().int().positive().nullable().optional(),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class Reminder {
  constructor(data) {
    const validated = reminderSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `rem-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new Reminder({
      ...input,
      id,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  trigger(timestamp = Date.now()) {
    if (this.status === 'cancelled') {
      throw new Error(`Cannot trigger a cancelled reminder: ${this.id}`);
    }
    this.status = 'triggered';
    this.triggered_at = timestamp;
    this.updated_at = timestamp;
  }

  complete(timestamp = Date.now()) {
    this.status = 'completed';
    this.updated_at = timestamp;
  }

  cancel(timestamp = Date.now()) {
    if (this.status === 'completed') {
      throw new Error(`Cannot cancel an already completed reminder: ${this.id}`);
    }
    this.status = 'cancelled';
    this.updated_at = timestamp;
  }

  static fromRow(row) {
    if (!row) return null;
    return new Reminder({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      message: row.message || null,
      scheduled_time: Number(row.scheduled_time),
      reminder_type: row.reminder_type || 'commute',
      status: row.status || 'scheduled',
      related_resource_type: row.related_resource_type || null,
      related_resource_id: row.related_resource_id || null,
      triggered_at: row.triggered_at ? Number(row.triggered_at) : null,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      title: this.title,
      message: this.message || null,
      scheduled_time: this.scheduled_time,
      reminder_type: this.reminder_type,
      status: this.status,
      related_resource_type: this.related_resource_type || null,
      related_resource_id: this.related_resource_id || null,
      triggered_at: this.triggered_at || null,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      title: this.title,
      message: this.message,
      scheduled_time: this.scheduled_time,
      reminder_type: this.reminder_type,
      status: this.status,
      related_resource_type: this.related_resource_type,
      related_resource_id: this.related_resource_id,
      triggered_at: this.triggered_at,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = {
  Reminder,
  reminderSchema,
  reminderTypeEnum,
  reminderStatusEnum
};
