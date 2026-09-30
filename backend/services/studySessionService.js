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

    return this.studyRepo.create(session);
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

    return this.studyRepo.update(sessionId, processedUpdates);
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
