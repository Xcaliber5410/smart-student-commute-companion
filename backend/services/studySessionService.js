/**
 * StudySessionService
 *
 * Business logic for student study sessions and productivity blocks.
 * Enforces student ownership, course & assignment linking integrity, and lifecycle transitions.
 */

const { StudySession } = require('../models/StudySession');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

class StudySessionService {
  constructor(
    studyRepo = studySessionRepository,
    crseRepo = courseRepository,
    asgnRepo = assignmentRepository,
    remRepo = reminderRepository
  ) {
    this.studyRepo = studyRepo;
    this.courseRepo = crseRepo;
    this.asgnRepo = asgnRepo;
    this.remRepo = remRepo;
  }

  syncStudySessionReminder(session) {
    if (!session || !session.id) return null;

    // If session is completed, cancelled, or reminders disabled, cancel any scheduled reminders
    if (session.status === 'completed' || session.status === 'cancelled' || !session.reminder_enabled) {
      const existing = this.remRepo.findByResource('study_session', session.id);
      for (const rem of existing) {
        if (rem.status === 'scheduled') {
          this.remRepo.updateStatus(rem.id, 'cancelled');
        }
      }
      return null;
    }

    // Active session: calculate reminder trigger timestamp
    const leadTimeMs = (session.reminder_lead_time_minutes || 15) * 60 * 1000;
    let scheduledTime = session.planned_start_time - leadTimeMs;
    const now = Date.now();

    // If session is already in the past, don't schedule
    if (session.planned_start_time <= now) {
      return null;
    }

    // If trigger in past but session future, clamp to immediate
    if (scheduledTime <= now && session.planned_start_time > now) {
      scheduledTime = now;
    }

    let courseSuffix = '';
    if (session.course_id) {
      const course = this.courseRepo.findById(session.course_id);
      if (course) courseSuffix = ` for ${course.name}`;
    }

    const title = `Study Session: ${session.title}`;
    const message = `Planned study block of ${session.planned_duration_minutes} minutes${courseSuffix}.`;

    const existing = this.remRepo.findByResource('study_session', session.id);
    const activeScheduled = existing.find(r => r.status === 'scheduled');

    if (activeScheduled) {
      return this.remRepo.update(activeScheduled.id, {
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'study_session'
      });
    } else {
      return this.remRepo.create({
        user_id: session.user_id,
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'study_session',
        status: 'scheduled',
        related_resource_type: 'study_session',
        related_resource_id: session.id
      });
    }
  }

  async createSession(userId, data) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    if (data.planned_duration_minutes <= 0) {
      throw new ValidationError('planned_duration_minutes must be greater than 0');
    }

    // Verify course ownership if course_id provided
    if (data.course_id) {
      const course = this.courseRepo.findById(data.course_id);
      if (!course) {
        throw new NotFoundError(`Course with ID ${data.course_id} not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link study session to a course belonging to another student');
      }
    }

    // Verify assignment ownership if assignment_id provided
    if (data.assignment_id) {
      const assignment = this.asgnRepo.findById(data.assignment_id);
      if (!assignment) {
        throw new NotFoundError(`Assignment with ID ${data.assignment_id} not found`);
      }
      if (assignment.user_id !== userId) {
        throw new ForbiddenError('Cannot link study session to an assignment belonging to another student');
      }
    }

    const session = StudySession.create({
      ...data,
      user_id: userId
    });

    const saved = this.studyRepo.create(session);
    this.syncStudySessionReminder(saved);
    return saved;
  }

  async getSessionById(userId, sessionId) {
    if (!sessionId) {
      throw new ValidationError('Study session ID is required');
    }

    const session = this.studyRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError(`Study session with ID ${sessionId} not found`);
    }

    if (session.user_id !== userId) {
      throw new ForbiddenError('Access forbidden: you do not have permission to view this study session');
    }

    return session;
  }

  async listSessions(userId, query = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    return this.studyRepo.findWithPaginationAndFilters(userId, query);
  }

  async getSessionsInRange(userId, rangeStart, rangeEnd, options = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }
    if (rangeStart >= rangeEnd) {
      throw new ValidationError('rangeStart must be strictly before rangeEnd');
    }

    return this.studyRepo.findInRange(userId, rangeStart, rangeEnd, options);
  }

  async updateSession(userId, sessionId, updates) {
    const existing = await this.getSessionById(userId, sessionId);

    if (updates.course_id !== undefined && updates.course_id !== null && updates.course_id !== existing.course_id) {
      const course = this.courseRepo.findById(updates.course_id);
      if (!course) {
        throw new NotFoundError(`Course with ID ${updates.course_id} not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link study session to a course belonging to another student');
      }
    }

    if (updates.assignment_id !== undefined && updates.assignment_id !== null && updates.assignment_id !== existing.assignment_id) {
      const assignment = this.asgnRepo.findById(updates.assignment_id);
      if (!assignment) {
        throw new NotFoundError(`Assignment with ID ${updates.assignment_id} not found`);
      }
      if (assignment.user_id !== userId) {
        throw new ForbiddenError('Cannot link study session to an assignment belonging to another student');
      }
    }

    const processedUpdates = { ...updates };

    // Handle status transition side effects
    if (updates.status === 'completed' && existing.status !== 'completed') {
      processedUpdates.completed_at = Date.now();
      if (processedUpdates.actual_duration_minutes === undefined || processedUpdates.actual_duration_minutes === null) {
        processedUpdates.actual_duration_minutes = updates.planned_duration_minutes || existing.planned_duration_minutes;
      }
    } else if (updates.status && updates.status !== 'completed' && existing.status === 'completed') {
      processedUpdates.completed_at = null;
    }

    const updated = this.studyRepo.update(sessionId, processedUpdates);
    this.syncStudySessionReminder(updated);
    return updated;
  }

  async updateStatus(userId, sessionId, status, actualDuration) {
    const updates = { status };
    if (actualDuration !== undefined) {
      updates.actual_duration_minutes = actualDuration;
    }
    return this.updateSession(userId, sessionId, updates);
  }

  async deleteSession(userId, sessionId) {
    // Check existence and ownership
    await this.getSessionById(userId, sessionId);

    // Clean up any linked reminder records
    this.remRepo.deleteByResource('study_session', sessionId);

    return this.studyRepo.delete(sessionId);
  }
}

module.exports = {
  StudySessionService,
  studySessionService: new StudySessionService()
};
