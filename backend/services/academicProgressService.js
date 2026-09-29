/**
 * AcademicProgressService
 *
 * Single-pass authoritative aggregation service for student academic progress,
 * deliverable status summaries, overdue metrics, and upcoming deadlines.
 */

const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { ForbiddenError, NotFoundError } = require('../errors');

class AcademicProgressService {
  constructor(
    asgnRepo = assignmentRepository,
    courseRepo = courseRepository,
    userRepo = userRepository
  ) {
    this.asgnRepo = asgnRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
  }

  assertOwnership(studentUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access academic progress');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === studentUserId) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to view another student academic progress');
  }

  getStudentAcademicSummary(studentUserId, requestingUser, options = {}) {
    this.assertOwnership(studentUserId, requestingUser);

    const user = this.userRepo.findById(studentUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${studentUserId}' not found`);
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const summary = this.asgnRepo.getAcademicSummary(studentUserId, now);

    return {
      studentId: studentUserId,
      asOfTimestamp: now,
      ...summary
    };
  }
}

const academicProgressService = new AcademicProgressService();

module.exports = {
  AcademicProgressService,
  academicProgressService
};
