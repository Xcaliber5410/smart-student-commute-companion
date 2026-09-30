/**
 * CalendarRangeService
 *
 * Provides aggregated schedule, today's agenda, and upcoming commitments across
 * calendar events, study sessions, and academic assignment deadlines.
 */

const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { getConnection } = require('../db/connection');
const { Assignment } = require('../models/Assignment');
const { getMumbaiTodayRange } = require('../utils/timezone');
const { ValidationError } = require('../errors');

class CalendarRangeService {
  constructor(
    eventRepo = calendarEventRepository,
    studyRepo = studySessionRepository,
    asgnRepo = assignmentRepository,
    crseRepo = courseRepository,
    dbInstance = null
  ) {
    this.eventRepo = eventRepo;
    this.studyRepo = studyRepo;
    this.asgnRepo = asgnRepo;
    this.courseRepo = crseRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  async getScheduleInRange(userId, rangeStart, rangeEnd) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }
    const start = Number(rangeStart);
    const end = Number(rangeEnd);

    if (isNaN(start) || isNaN(end) || start >= end) {
      throw new ValidationError('start must be strictly before end timestamp');
    }

    // 1. Fetch calendar events in range
    const events = this.eventRepo.findInRange(userId, start, end);

    // 2. Fetch study sessions in range
    const studySessions = this.studyRepo.findInRange(userId, start, end);

    // 3. Fetch assignments with deadlines in range
    const asgnStmt = this.database.prepare(`
      SELECT * FROM assignments 
      WHERE user_id = ? 
        AND due_date >= ? 
        AND due_date <= ? 
        AND status != 'cancelled'
      ORDER BY due_date ASC
    `);
    const asgnRows = asgnStmt.all(userId, start, end);
    const assignments = asgnRows.map(r => Assignment.fromRow(r));

    // 4. Construct unified chronological timeline
    const timeline = [];

    for (const e of events) {
      timeline.push({
        type: 'event',
        id: e.id,
        title: e.title,
        startTime: e.start_time,
        endTime: e.end_time,
        durationMinutes: e.durationMinutes,
        eventType: e.event_type,
        location: e.location,
        courseId: e.course_id,
        status: e.status
      });
    }

    for (const s of studySessions) {
      timeline.push({
        type: 'study_session',
        id: s.id,
        title: s.title,
        startTime: s.planned_start_time,
        endTime: s.plannedEndTime,
        durationMinutes: s.planned_duration_minutes,
        courseId: s.course_id,
        assignmentId: s.assignment_id,
        status: s.status
      });
    }

    for (const a of assignments) {
      timeline.push({
        type: 'assignment_deadline',
        id: a.id,
        title: `Deadline: ${a.title}`,
        startTime: a.due_date,
        endTime: a.due_date,
        durationMinutes: 0,
        priority: a.priority,
        courseId: a.course_id,
        status: a.status
      });
    }

    // Sort timeline deterministically by startTime ASC, then endTime ASC
    timeline.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

    return {
      range: {
        start,
        end,
        days: Math.max(1, Math.round((end - start) / 86400000))
      },
      counts: {
        totalItems: timeline.length,
        events: events.length,
        studySessions: studySessions.length,
        deadlines: assignments.length
      },
      events: events.map(e => e.toJSON()),
      studySessions: studySessions.map(s => s.toJSON()),
      assignments: assignments.map(a => a.toJSON()),
      timeline
    };
  }

  async getTodaySchedule(userId) {
    const { startOfDay, endOfDay } = getMumbaiTodayRange();
    const result = await this.getScheduleInRange(userId, startOfDay, endOfDay);
    return {
      period: 'today',
      timezone: 'Asia/Kolkata',
      ...result
    };
  }

  async getUpcomingSchedule(userId, days = 7) {
    const now = Date.now();
    const futureEnd = now + (Number(days) * 86400000);
    const result = await this.getScheduleInRange(userId, now, futureEnd);
    return {
      period: 'upcoming',
      windowDays: Number(days),
      ...result
    };
  }
}

module.exports = {
  CalendarRangeService,
  calendarRangeService: new CalendarRangeService()
};
