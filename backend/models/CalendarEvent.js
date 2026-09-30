/**
 * CalendarEvent Domain Model
 *
 * Represents an academic lecture, lab, exam, or student calendar event.
 */

const { z } = require('zod');

const eventTypeEnum = z.enum(['lecture', 'lab', 'exam', 'study', 'deadline', 'extracurricular', 'personal']);
const eventStatusEnum = z.enum(['scheduled', 'cancelled']);

const calendarEventSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  course_id: z.string().nullable().default(null),
  title: z.string().min(2, 'Title must have at least 2 characters').max(150),
  description: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  event_type: eventTypeEnum.default('lecture'),
  start_time: z.number().int().positive('start_time must be a positive timestamp'),
  end_time: z.number().int().positive('end_time must be a positive timestamp'),
  status: eventStatusEnum.default('scheduled'),
  reminder_enabled: z.number().int().min(0).max(1).default(1),
  reminder_lead_time_minutes: z.number().int().min(0).max(43200).default(30), // Up to 30 days
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
}).refine(data => data.start_time < data.end_time, {
  message: 'start_time must be strictly before end_time',
  path: ['end_time']
});

class CalendarEvent {
  constructor(data) {
    const validated = calendarEventSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `evt-${now}-${Math.random().toString(36).substring(2, 7)}`;
    return new CalendarEvent({
      ...input,
      id,
      course_id: input.course_id || null,
      description: input.description || null,
      location: input.location || null,
      event_type: input.event_type || 'lecture',
      status: input.status || 'scheduled',
      reminder_enabled: input.reminder_enabled !== undefined ? (input.reminder_enabled ? 1 : 0) : 1,
      reminder_lead_time_minutes: input.reminder_lead_time_minutes !== undefined ? Number(input.reminder_lead_time_minutes) : 30,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new CalendarEvent({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id || null,
      title: row.title,
      description: row.description || null,
      location: row.location || null,
      event_type: row.event_type || 'lecture',
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      status: row.status || 'scheduled',
      reminder_enabled: row.reminder_enabled ? 1 : 0,
      reminder_lead_time_minutes: Number(row.reminder_lead_time_minutes || 30),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  get durationMinutes() {
    return Math.round((this.end_time - this.start_time) / 60000);
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      course_id: this.course_id,
      title: this.title,
      description: this.description,
      location: this.location,
      event_type: this.event_type,
      start_time: this.start_time,
      end_time: this.end_time,
      status: this.status,
      reminder_enabled: this.reminder_enabled,
      reminder_lead_time_minutes: this.reminder_lead_time_minutes,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.user_id,
      courseId: this.course_id,
      title: this.title,
      description: this.description,
      location: this.location,
      eventType: this.event_type,
      startTime: this.start_time,
      endTime: this.end_time,
      durationMinutes: Math.round((this.end_time - this.start_time) / 60000),
      status: this.status,
      reminderEnabled: Boolean(this.reminder_enabled),
      reminderLeadTimeMinutes: this.reminder_lead_time_minutes,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  CalendarEvent,
  eventTypeEnum,
  eventStatusEnum,
  calendarEventSchema
};
