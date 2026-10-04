/**
 * AssignmentService
 *
 * Business logic and authorization guards for student academic tasks and assignments.
 */

const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { getConnection } = require('../db/connection');
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
    userRepo = userRepository,
    remRepo = reminderRepository,
    goalRepo = goalRepository,
    resourceRepo = studyResourceRepository
  ) {
    this.assignmentRepo = assignmentRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
    this.remRepo = remRepo;
    this.goalRepo = goalRepo;
    this.resourceRepo = resourceRepo;
  }

  getGoalService() {
    return require('./goalService').goalService;
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

  syncAssignmentReminder(assignment) {
    if (!assignment || !assignment.id) return null;

    // If assignment is completed, cancelled, or reminders disabled, cancel any scheduled reminders
    if (assignment.status === 'completed' || assignment.status === 'cancelled' || !assignment.reminder_enabled) {
      const existing = this.remRepo.findByResource('assignment', assignment.id);
      for (const rem of existing) {
        if (rem.status === 'scheduled') {
          this.remRepo.updateStatus(rem.id, 'cancelled');
        }
      }
      return null;
    }

    // Active assignment: calculate reminder trigger timestamp
    const leadTimeMs = (assignment.reminder_lead_time_minutes || 1440) * 60 * 1000;
    let scheduledTime = assignment.due_date - leadTimeMs;
    const now = Date.now();

    // If reminder trigger is in past but deadline is future, clamp to immediate trigger
    if (scheduledTime <= now && assignment.due_date > now) {
      scheduledTime = now;
    }

    let courseSuffix = '';
    if (assignment.course_id) {
      const course = this.courseRepo.findById(assignment.course_id);
      if (course) courseSuffix = ` for ${course.name}`;
    }

    const title = `Assignment Due: ${assignment.title}`;
    const message = `Submission deadline approaching${courseSuffix}.`;

    const existing = this.remRepo.findByResource('assignment', assignment.id);
    const activeScheduled = existing.find(r => r.status === 'scheduled');

    if (activeScheduled) {
      return this.remRepo.update(activeScheduled.id, {
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'assignment'
      });
    } else {
      return this.remRepo.create({
        user_id: assignment.user_id,
        title,
        message,
        scheduled_time: scheduledTime,
        reminder_type: 'assignment',
        status: 'scheduled',
        related_resource_type: 'assignment',
        related_resource_id: assignment.id
      });
    }
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

    // Validate goal ownership if goal_id is provided
    if (input.goal_id) {
      const goal = this.goalRepo.findById(input.goal_id);
      if (!goal) {
        throw new NotFoundError(`Goal with id '${input.goal_id}' not found`);
      }
      if (goal.user_id !== userId) {
        throw new ForbiddenError('Cannot link assignment to a goal belonging to another student');
      }
    }

    const assignmentInstance = Assignment.create({
      ...input,
      title: input.title.trim(),
      user_id: userId,
      due_date: Number(input.due_date)
    });

    const created = this.assignmentRepo.create(assignmentInstance);
    // Sync scheduled deadline reminder
    this.syncAssignmentReminder(created);

    // Sync goal progress if linked to a goal
    if (created.goal_id) {
      this.getGoalService().syncGoalProgressFromWork(created.goal_id, requestingUser);
    }

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

    if (updates.goal_id !== undefined && updates.goal_id !== null && updates.goal_id !== '') {
      const goal = this.goalRepo.findById(updates.goal_id);
      if (!goal) {
        throw new NotFoundError(`Goal with id '${updates.goal_id}' not found`);
      }
      if (goal.user_id !== assignment.user_id) {
        throw new ForbiddenError('Cannot link assignment to a goal belonging to another student');
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

    // Re-sync reminder with updated deadline / status
    this.syncAssignmentReminder(updated);

    // Sync goal progress if goal relationship changed or updated
    if (assignment.goal_id) {
      this.getGoalService().syncGoalProgressFromWork(assignment.goal_id, requestingUser);
    }
    if (updates.goal_id && updates.goal_id !== assignment.goal_id) {
      this.getGoalService().syncGoalProgressFromWork(updates.goal_id, requestingUser);
    }

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

    // Cancel or restore reminder based on status change
    this.syncAssignmentReminder(updated);

    // Sync goal progress if assignment is tied to a goal
    if (updated.goal_id) {
      this.getGoalService().syncGoalProgressFromWork(updated.goal_id, requestingUser);
    }

    return updated.toJSON();
  }

  deleteAssignment(id, requestingUser) {
    const assignment = this.assignmentRepo.findById(id);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${id}' not found`);
    }

    this.assertOwnership(assignment, requestingUser);

    const previousGoalId = assignment.goal_id;

    // Clean up any associated reminders
    this.remRepo.deleteByResource('assignment', id);
    this.assignmentRepo.delete(id);

    // If assignment belonged to a goal, sync goal progress
    if (previousGoalId) {
      this.getGoalService().syncGoalProgressFromWork(previousGoalId, requestingUser);
    }

    return { success: true, id };
  }

  getAssignmentResources(assignmentId, requestingUser) {
    const assignment = this.assignmentRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${assignmentId}' not found`);
    }
    this.assertOwnership(assignment, requestingUser);

    const resources = this.resourceRepo.findByAssignment(assignmentId, assignment.user_id);
    return {
      assignment: assignment.toJSON(),
      resources: resources.map(r => (r.toJSON ? r.toJSON() : r))
    };
  }

  linkResources(assignmentId, resourceIds, requestingUser) {
    const assignment = this.assignmentRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${assignmentId}' not found`);
    }
    this.assertOwnership(assignment, requestingUser);

    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      throw new BadRequestError('At least one resource ID must be provided');
    }

    // Pre-flight check: verify all resources exist and belong to the same student
    const resources = [];
    for (const rId of resourceIds) {
      const res = this.resourceRepo.findById(rId);
      if (!res) {
        throw new NotFoundError(`Study resource with id '${rId}' not found`);
      }
      if (res.user_id !== assignment.user_id) {
        throw new ForbiddenError('Cannot link study resource belonging to another student to this assignment');
      }
      resources.push(res);
    }

    // Execute atomic update inside transaction
    const db = getConnection();
    const tx = db.transaction(() => {
      for (const res of resources) {
        this.resourceRepo.update(res.id, assignment.user_id, { assignment_id: assignmentId });
      }
    });
    tx();

    const updatedResources = this.resourceRepo.findByAssignment(assignmentId, assignment.user_id);
    return {
      assignment: assignment.toJSON(),
      resources: updatedResources.map(r => (r.toJSON ? r.toJSON() : r))
    };
  }

  unlinkResource(assignmentId, resourceId, requestingUser) {
    const assignment = this.assignmentRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment with id '${assignmentId}' not found`);
    }
    this.assertOwnership(assignment, requestingUser);

    const res = this.resourceRepo.findById(resourceId);
    if (!res) {
      throw new NotFoundError(`Study resource with id '${resourceId}' not found`);
    }
    if (res.user_id !== assignment.user_id) {
      throw new ForbiddenError('Cannot manage study resource belonging to another student');
    }
    if (res.assignment_id !== assignmentId) {
      throw new BadRequestError(`Study resource '${resourceId}' is not associated with assignment '${assignmentId}'`);
    }

    this.resourceRepo.update(resourceId, assignment.user_id, { assignment_id: null });

    return {
      assignment: assignment.toJSON(),
      unlinkedResourceId: resourceId
    };
  }
}

module.exports = {
  AssignmentService,
  assignmentService: new AssignmentService()
};
