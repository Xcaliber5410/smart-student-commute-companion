/**
 * CalendarEventService
 *
 * Business logic for student calendar events, lectures, exams, and labs.
 * Enforces ownership, course relationship integrity, and time validation.
 */

const { CalendarEvent } = require('../models/CalendarEvent');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

class CalendarEventService {
  constructor(eventRepo = calendarEventRepository, crseRepo = courseRepository, remRepo = reminderRepository) {
    this.eventRepo = eventRepo;
    this.courseRepo = crseRepo;
    this.remRepo = remRepo;
  }

  syncEventReminder(event) {
    if (!event || !event.id) return null;

    // If event is cancelled or reminders disabled, cancel any scheduled reminders
    if (event.status === 'cancelled' || !event.reminder_enabled) {
      const existing = this.remRepo.findByResource('calendar_event', event.id);
      for (const rem of existing) {
        if (rem.status === 'scheduled') {
          this.remRepo.updateStatus(rem.id, 'cancelled');
        }
      }
      return null;
    }

    // Active event: calculate reminder trigger timestamp
    const leadTimeMs = (event.reminder_lead_time_minutes || 30) * 60 * 1000;
    let scheduledTime = event.start_time - leadTimeMs;
    const now = Date.now();

    // If event is already in the past, don't create reminders
    if (event.start_time <= now) {
      return null;
    }

    // If reminder trigger is in past but event is future, clamp to immediate trigger
    if (scheduledTime <= now && event.start_time > now) {
      scheduledTime = now;
    }

    let courseSuffix = '';
    if (event.course_id) {
      const course = this.courseRepo.findById(event.course_id);
      if (course) courseSuffix = ` (${course.name})`;
    }

    const title = `Upcoming ${event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}: ${event.title}`;
    const locationStr = event.location ? ` at ${event.location}` : '';
    const message = `Event starting soon${courseSuffix}${locationStr}.`;

    const existing = this.remRepo.findByResource('calendar_event', event.id);
    const activeScheduled = existing.find(r => r.status === 'scheduled');

    if (activeScheduled) {
      return this.remRepo.update(activeScheduled.id, {
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'calendar_event'
      });
    } else {
      return this.remRepo.create({
        user_id: event.user_id,
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'calendar_event',
        status: 'scheduled',
        related_resource_type: 'calendar_event',
        related_resource_id: event.id
      });
    }
  }

  async createEvent(userId, data) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    if (data.start_time >= data.end_time) {
      throw new ValidationError('start_time must be strictly before end_time');
    }

    // Verify course ownership if course_id provided
    if (data.course_id) {
      const course = this.courseRepo.findById(data.course_id);
      if (!course) {
        throw new NotFoundError(`Course with ID ${data.course_id} not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link event to a course belonging to another student');
      }
    }

    const event = CalendarEvent.create({
      ...data,
      user_id: userId
    });

    const saved = this.eventRepo.create(event);
    this.syncEventReminder(saved);
    return saved;
  }

  async getEventById(userId, eventId) {
    if (!eventId) {
      throw new ValidationError('Event ID is required');
    }

    const event = this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError(`Calendar event with ID ${eventId} not found`);
    }

    if (event.user_id !== userId) {
      throw new ForbiddenError('Access forbidden: you do not have permission to view this calendar event');
    }

    return event;
  }

  async listEvents(userId, query = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    return this.eventRepo.findWithPaginationAndFilters(userId, query);
  }

  async getEventsInRange(userId, rangeStart, rangeEnd, options = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }
    if (rangeStart >= rangeEnd) {
      throw new ValidationError('rangeStart must be strictly before rangeEnd');
    }

    return this.eventRepo.findInRange(userId, rangeStart, rangeEnd, options);
  }

  async updateEvent(userId, eventId, updates) {
    const existing = await this.getEventById(userId, eventId);

    const newStartTime = updates.start_time !== undefined ? Number(updates.start_time) : existing.start_time;
    const newEndTime = updates.end_time !== undefined ? Number(updates.end_time) : existing.end_time;

    if (newStartTime >= newEndTime) {
      throw new ValidationError('start_time must be strictly before end_time');
    }

    if (updates.course_id !== undefined && updates.course_id !== null && updates.course_id !== existing.course_id) {
      const course = this.courseRepo.findById(updates.course_id);
      if (!course) {
        throw new NotFoundError(`Course with ID ${updates.course_id} not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link event to a course belonging to another student');
      }
    }

    const updated = this.eventRepo.update(eventId, updates);
    this.syncEventReminder(updated);
    return updated;
  }

  async deleteEvent(userId, eventId) {
    // Check existence and ownership
    await this.getEventById(userId, eventId);

    // Clean up any linked reminder records
    this.remRepo.deleteByResource('calendar_event', eventId);

    return this.eventRepo.delete(eventId);
  }
}

module.exports = {
  CalendarEventService,
  calendarEventService: new CalendarEventService()
};
