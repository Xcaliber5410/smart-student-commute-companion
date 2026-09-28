/**
 * Notification Domain Model
 *
 * Represents an in-app notification delivered to an authenticated student.
 */

const { z } = require('zod');

const notificationTypeEnum = z.enum(['reminder', 'disruption', 'ride_group', 'system']);
const notificationPriorityEnum = z.enum(['low', 'medium', 'high']);

const notificationSchema = z.object({
  id: z.string().min(1, 'Notification ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  type: notificationTypeEnum.default('reminder'),
  title: z.string().min(1).max(150),
  message: z.string().min(1).max(500),
  priority: notificationPriorityEnum.default('medium'),
  read: z.union([z.boolean(), z.number().transform(n => n === 1)]).default(false),
  read_at: z.number().int().positive().nullable().optional(),
  related_resource_type: z.string().max(50).nullable().optional(),
  related_resource_id: z.string().max(100).nullable().optional(),
  payload: z.record(z.any()).default({}),
  created_at: z.number().int().positive().default(() => Date.now()),
  expires_at: z.number().int().positive().nullable().optional()
});

class Notification {
  constructor(data) {
    const validated = notificationSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `notif-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new Notification({
      ...input,
      id,
      created_at: input.created_at || now
    });
  }

  markAsRead(timestamp = Date.now()) {
    this.read = true;
    this.read_at = timestamp;
  }

  markAsUnread() {
    this.read = false;
    this.read_at = null;
  }

  static fromRow(row) {
    if (!row) return null;
    let parsedPayload = {};
    if (typeof row.payload === 'string') {
      try {
        parsedPayload = JSON.parse(row.payload);
      } catch (e) {
        parsedPayload = {};
      }
    } else if (row.payload && typeof row.payload === 'object') {
      parsedPayload = row.payload;
    }

    return new Notification({
      id: row.id,
      user_id: row.user_id,
      type: row.type || 'reminder',
      title: row.title,
      message: row.message,
      priority: row.priority || 'medium',
      read: Boolean(row.read),
      read_at: row.read_at ? Number(row.read_at) : null,
      related_resource_type: row.related_resource_type || null,
      related_resource_id: row.related_resource_id || null,
      payload: parsedPayload,
      created_at: Number(row.created_at),
      expires_at: row.expires_at ? Number(row.expires_at) : null
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      type: this.type,
      title: this.title,
      message: this.message,
      priority: this.priority,
      read: this.read ? 1 : 0,
      read_at: this.read_at || null,
      related_resource_type: this.related_resource_type || null,
      related_resource_id: this.related_resource_id || null,
      payload: JSON.stringify(this.payload || {}),
      created_at: this.created_at,
      expires_at: this.expires_at || null
    };
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      type: this.type,
      title: this.title,
      message: this.message,
      priority: this.priority,
      read: this.read,
      read_at: this.read_at,
      related_resource_type: this.related_resource_type,
      related_resource_id: this.related_resource_id,
      payload: this.payload,
      created_at: this.created_at,
      expires_at: this.expires_at
    };
  }
}

module.exports = {
  Notification,
  notificationSchema,
  notificationTypeEnum,
  notificationPriorityEnum
};
