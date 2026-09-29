/**
 * AssignmentService
 *
 * Business logic and authorization guards for student academic tasks and assignments.
 */

const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { Assignment } = require('../models/Assignment');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class AssignmentService {
  constructor(
    assignmentRepo = assignmentRepository,
    courseRepo = courseRepository,
    userRepo = userRepository
  ) {
    this.assignmentRepo = assignmentRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
  }

  assertOwnership(assignment, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access academic task');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === assignment.user_id) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to manage another student academic task');
  }

  createAssignment(userId, input, requestingUser) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only create assignments for your own account');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 2) {
      throw new BadRequestError('Assignment title must have at least 2 characters');
    }

    if (!input.due_date || typeof Number(input.due_date) !== 'number' || Number(input.due_date) <= 0) {
      throw new BadRequestError('A valid positive due_date timestamp is required');
    }

    // Validate course ownership if course_id is provided
    if (input.course_id) {
      const course = this.courseRepo.findById(input.course_id);
      if (!course) {
        throw new NotFoundError(`Course with id '${input.course_id}' not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link assignment to a course belonging to another student');
      }
    }

    const assignmentInstance = Assignment.create({
      ...input,
      title: input.title.trim(),
      user_id: userId,
      due_date: Number(input.due_date)
    });

    const created = this.assignmentRepo.create(assignmentInstance);
    return created.toJSON();
  }

  listAssignments(userId, requestingUser, options = {}) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only view your own academic tasks');
    }

    const result = this.assignmentRepo.findWithPaginationAndFilters(userId, options);
    return {
      assignments: result.data.map(a => a.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    };
  }

  getAssignmentById(id, requestingUser) {
    const assignment = this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${id}' not found`);
    }

    this.assertOwnership(assignment, requestingUser);
    return assignment.toJSON();
  }

  updateAssignment(id, updates, requestingUser) {
    const assignment = this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${id}' not found`);
    }

    this.assertOwnership(assignment, requestingUser);

    if (updates.course_id !== undefined && updates.course_id !== null) {
      const course = this.courseRepo.findById(updates.course_id);
      if (!course) {
        throw new NotFoundError(`Course with id '${updates.course_id}' not found`);
      }
      if (course.user_id !== assignment.user_id) {
        throw new ForbiddenError('Cannot link assignment to a course belonging to another student');
      }
    }

    if (updates.due_date !== undefined) {
      if (typeof Number(updates.due_date) !== 'number' || Number(updates.due_date) <= 0) {
        throw new BadRequestError('due_date must be a valid positive timestamp');
      }
    }

    let completedAt = assignment.completed_at;
    if (updates.status !== undefined) {
      if (updates.status === 'completed' && assignment.status !== 'completed') {
        completedAt = Date.now();
      } else if (updates.status !== 'completed') {
        completedAt = null;
      }
    }

    const updated = this.assignmentRepo.update(id, {
      ...updates,
      title: updates.title ? updates.title.trim() : undefined,
      due_date: updates.due_date ? Number(updates.due_date) : undefined,
      completed_at: completedAt
    });

    return updated.toJSON();
  }

  updateStatus(id, newStatus, requestingUser) {
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestError(`Invalid status '${newStatus}'. Allowed: ${validStatuses.join(', ')}`);
    }

    const assignment = this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${id}' not found`);
    }

    this.assertOwnership(assignment, requestingUser);

    const completedAt = newStatus === 'completed' ? Date.now() : null;
    const updated = this.assignmentRepo.updateStatus(id, newStatus, completedAt);
    return updated.toJSON();
  }

  deleteAssignment(id, requestingUser) {
    const assignment = this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${id}' not found`);
    }

    this.assertOwnership(assignment, requestingUser);
    this.assignmentRepo.delete(id);
    return { success: true, id };
  }
}

module.exports = {
  AssignmentService,
  assignmentService: new AssignmentService()
};
