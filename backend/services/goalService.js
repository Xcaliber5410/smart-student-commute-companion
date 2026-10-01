/**
 * GoalService
 *
 * Business logic and authorization guards for student goals and progress tracking.
 */

const { goalRepository } = require('../repositories/GoalRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { getConnection } = require('../db/connection');
const { Goal } = require('../models/Goal');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class GoalService {
  constructor(
    goalRepo = goalRepository,
    courseRepo = courseRepository,
    userRepo = userRepository,
    asgnRepo = assignmentRepository,
    studyRepo = studySessionRepository,
    dbInstance = null
  ) {
    this.goalRepo = goalRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
    this.asgnRepo = asgnRepo;
    this.studyRepo = studyRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  assertOwnership(goal, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student goal');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === goal.user_id) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to access or manage this goal');
  }

  createGoal(userId, input, requestingUser) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only create goals for your own account');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 2) {
      throw new BadRequestError('Goal title must have at least 2 characters');
    }

    // Progress validation
    if (input.progress !== undefined) {
      const prog = Number(input.progress);
      if (isNaN(prog) || prog < 0 || prog > 100) {
        throw new BadRequestError('Goal progress must be an integer between 0 and 100');
      }
    }

    // Target date validation
    if (input.target_date !== undefined && input.target_date !== null) {
      const targetDate = Number(input.target_date);
      if (isNaN(targetDate) || targetDate <= 0) {
        throw new BadRequestError('Target date must be a valid positive timestamp');
      }
    }

    // Course relationship ownership validation
    if (input.course_id) {
      const course = this.courseRepo.findById(input.course_id);
      if (!course) {
        throw new NotFoundError(`Course with id '${input.course_id}' not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link goal to a course belonging to another student');
      }
    }

    const goal = Goal.create({
      ...input,
      user_id: userId
    });

    return this.goalRepo.create(goal);
  }

  getGoal(userId, goalId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    if (userId && requestingUser.role !== 'admin' && goal.user_id !== userId) {
      throw new ForbiddenError('Access forbidden: goal does not belong to the specified student');
    }

    return goal;
  }

  listGoals(userId, query = {}, requestingUser) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only view your own goals');
    }

    return this.goalRepo.findWithPaginationAndFilters(userId, query);
  }

  updateGoal(goalId, updates = {}, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    // Course relationship ownership validation
    if (updates.course_id !== undefined && updates.course_id !== null && updates.course_id !== '') {
      const course = this.courseRepo.findById(updates.course_id);
      if (!course) {
        throw new NotFoundError(`Course with id '${updates.course_id}' not found`);
      }
      if (course.user_id !== goal.user_id) {
        throw new ForbiddenError('Cannot link goal to a course belonging to another student');
      }
    }

    // Target date validation
    if (updates.target_date !== undefined && updates.target_date !== null) {
      const targetDate = Number(updates.target_date);
      if (isNaN(targetDate) || targetDate <= 0) {
        throw new BadRequestError('Target date must be a valid positive timestamp');
      }
    }

    // Progress validation
    if (updates.progress !== undefined) {
      const prog = Number(updates.progress);
      if (isNaN(prog) || prog < 0 || prog > 100) {
        throw new BadRequestError('Goal progress must be an integer between 0 and 100');
      }
    }

    // State transition validation
    if (updates.status && updates.status !== goal.status) {
      if (goal.status === 'cancelled' && updates.status === 'completed') {
        throw new BadRequestError('Cannot directly mark a cancelled goal as completed. Reopen it first.');
      }
    }

    const sanitizedUpdates = { ...updates };

    // Auto-update completed_at based on status and progress
    const nextStatus = updates.status || goal.status;
    const nextProgress = updates.progress !== undefined ? Number(updates.progress) : goal.progress;

    if (nextStatus === 'completed' || nextProgress >= 100) {
      sanitizedUpdates.status = 'completed';
      sanitizedUpdates.completed_at = goal.completed_at || Date.now();
    } else if (nextStatus !== 'completed' && goal.status === 'completed') {
      sanitizedUpdates.completed_at = null;
    }

    return this.goalRepo.update(goalId, sanitizedUpdates);
  }

  updateProgress(goalId, progressData = {}, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    // Invalid state transition: progress updates on cancelled goals
    if (goal.status === 'cancelled') {
      throw new BadRequestError('Cannot update progress on a cancelled goal. Reopen it first.');
    }

    // Progress validation
    if (progressData.progress !== undefined) {
      const prog = Number(progressData.progress);
      if (isNaN(prog) || prog < 0 || prog > 100) {
        throw new BadRequestError('Goal progress must be an integer between 0 and 100');
      }
    }

    // Current value validation
    if (progressData.current_value !== undefined) {
      const currVal = Number(progressData.current_value);
      if (isNaN(currVal) || currVal < 0) {
        throw new BadRequestError('Current value cannot be negative');
      }
    }

    // Compute progress
    let newProgress = goal.progress;
    let newCurrentValue = goal.current_value;

    if (progressData.current_value !== undefined) {
      newCurrentValue = Number(progressData.current_value);
      if (goal.target_value && goal.target_value > 0 && progressData.progress === undefined) {
        newProgress = Math.min(100, Math.max(0, Math.round((newCurrentValue / goal.target_value) * 100)));
      }
    }

    if (progressData.progress !== undefined) {
      newProgress = Number(progressData.progress);
    }

    const updates = {
      progress: newProgress,
      current_value: newCurrentValue
    };

    if (progressData.status) {
      if (goal.status === 'cancelled' && progressData.status === 'completed') {
        throw new BadRequestError('Cannot directly mark a cancelled goal as completed. Reopen it first.');
      }
      updates.status = progressData.status;
    } else if (newProgress >= 100) {
      updates.status = 'completed';
    }

    if (updates.status === 'completed') {
      updates.completed_at = goal.completed_at || Date.now();
    } else if (updates.status && updates.status !== 'completed') {
      updates.completed_at = null;
    }

    return this.goalRepo.update(goalId, updates);
  }

  completeGoal(goalId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    if (goal.status === 'cancelled') {
      throw new BadRequestError('Cannot complete a cancelled goal. Reopen it first.');
    }

    return this.goalRepo.update(goalId, {
      status: 'completed',
      progress: 100,
      completed_at: Date.now()
    });
  }

  cancelGoal(goalId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    return this.goalRepo.update(goalId, {
      status: 'cancelled',
      completed_at: null
    });
  }

  deleteGoal(goalId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }

    this.assertOwnership(goal, requestingUser);

    return this.goalRepo.delete(goalId);
  }

  linkAssignments(goalId, assignmentIds, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }
    this.assertOwnership(goal, requestingUser);

    if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
      throw new BadRequestError('At least one assignment ID must be provided');
    }

    // Pre-flight check: verify all assignments exist and belong to the same student
    const assignments = [];
    for (const aId of assignmentIds) {
      const asgn = this.asgnRepo.findById(aId);
      if (!asgn) {
        throw new NotFoundError(`Assignment with id '${aId}' not found`);
      }
      if (asgn.user_id !== goal.user_id) {
        throw new ForbiddenError('Cannot link task belonging to another student to this goal');
      }
      assignments.push(asgn);
    }

    // Execute atomic update inside transaction
    const db = this.database;
    const tx = db.transaction(() => {
      for (const asgn of assignments) {
        this.asgnRepo.update(asgn.id, { goal_id: goalId });
      }
    });
    tx();

    // Recalculate goal progress
    const updatedGoal = this.syncGoalProgressFromWork(goalId, requestingUser);
    const updatedAssignments = this.asgnRepo.findByGoalId(goalId);

    return {
      goal: updatedGoal.toJSON(),
      assignments: updatedAssignments.map(a => a.toJSON())
    };
  }

  unlinkAssignment(goalId, assignmentId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }
    this.assertOwnership(goal, requestingUser);

    const asgn = this.asgnRepo.findById(assignmentId);
    if (!asgn) {
      throw new NotFoundError(`Assignment with id '${assignmentId}' not found`);
    }
    if (asgn.user_id !== goal.user_id) {
      throw new ForbiddenError('Cannot manage task belonging to another student');
    }
    if (asgn.goal_id !== goalId) {
      throw new BadRequestError(`Assignment '${assignmentId}' is not associated with goal '${goalId}'`);
    }

    this.asgnRepo.update(assignmentId, { goal_id: null });

    const updatedGoal = this.syncGoalProgressFromWork(goalId, requestingUser);
    return {
      goal: updatedGoal.toJSON(),
      unlinkedAssignmentId: assignmentId
    };
  }

  linkStudySessions(goalId, sessionIds, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }
    this.assertOwnership(goal, requestingUser);

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new BadRequestError('At least one study session ID must be provided');
    }

    // Pre-flight check: verify all sessions exist and belong to the same student
    const sessions = [];
    for (const sId of sessionIds) {
      const sess = this.studyRepo.findById(sId);
      if (!sess) {
        throw new NotFoundError(`Study session with id '${sId}' not found`);
      }
      if (sess.user_id !== goal.user_id) {
        throw new ForbiddenError('Cannot link study session belonging to another student to this goal');
      }
      sessions.push(sess);
    }

    // Execute atomic update inside transaction
    const db = this.database;
    const tx = db.transaction(() => {
      for (const sess of sessions) {
        this.studyRepo.update(sess.id, { goal_id: goalId });
      }
    });
    tx();

    // Recalculate goal progress
    const updatedGoal = this.syncGoalProgressFromWork(goalId, requestingUser);
    const updatedSessions = this.studyRepo.findByGoalId(goalId);

    return {
      goal: updatedGoal.toJSON(),
      studySessions: updatedSessions.map(s => s.toJSON())
    };
  }

  unlinkStudySession(goalId, sessionId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }
    this.assertOwnership(goal, requestingUser);

    const sess = this.studyRepo.findById(sessionId);
    if (!sess) {
      throw new NotFoundError(`Study session with id '${sessionId}' not found`);
    }
    if (sess.user_id !== goal.user_id) {
      throw new ForbiddenError('Cannot manage study session belonging to another student');
    }
    if (sess.goal_id !== goalId) {
      throw new BadRequestError(`Study session '${sessionId}' is not associated with goal '${goalId}'`);
    }

    this.studyRepo.update(sessionId, { goal_id: null });

    const updatedGoal = this.syncGoalProgressFromWork(goalId, requestingUser);
    return {
      goal: updatedGoal.toJSON(),
      unlinkedSessionId: sessionId
    };
  }

  getGoalWorkSummary(goalId, requestingUser) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal with id '${goalId}' not found`);
    }
    this.assertOwnership(goal, requestingUser);

    const assignments = this.asgnRepo.findByGoalId(goalId);
    const assignmentSummary = this.asgnRepo.getGoalAssignmentSummary(goalId);

    const studySessions = this.studyRepo.findByGoalId(goalId);
    const studySessionSummary = this.studyRepo.getGoalStudySessionSummary(goalId);

    return {
      goal: goal.toJSON(),
      assignments: assignments.map(a => a.toJSON()),
      assignmentSummary,
      studySessions: studySessions.map(s => s.toJSON()),
      studySessionSummary
    };
  }

  syncGoalProgressFromWork(goalId, requestingUser = null) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      return null;
    }
    if (requestingUser) {
      this.assertOwnership(goal, requestingUser);
    }

    const asgnStats = this.asgnRepo.getGoalAssignmentSummary(goalId);
    const studyStats = this.studyRepo.getGoalStudySessionSummary(goalId);

    let calculatedProgress = goal.progress;
    let calculatedCurrentValue = goal.current_value;

    const unit = (goal.unit || '').toLowerCase();

    // 1. Time / Session-based goal
    if (unit === 'hours' || unit === 'hour') {
      calculatedCurrentValue = studyStats.completed_hours;
      if (goal.target_value && goal.target_value > 0) {
        calculatedProgress = Math.min(100, Math.max(0, Math.round(((studyStats.completed_minutes / 60) / goal.target_value) * 100)));
      }
    } else if (unit === 'minutes' || unit === 'mins' || unit === 'minute') {
      calculatedCurrentValue = studyStats.completed_minutes;
      if (goal.target_value && goal.target_value > 0) {
        calculatedProgress = Math.min(100, Math.max(0, Math.round((calculatedCurrentValue / goal.target_value) * 100)));
      }
    } else if (unit === 'sessions' || unit === 'session') {
      calculatedCurrentValue = studyStats.completed_sessions;
      if (goal.target_value && goal.target_value > 0) {
        calculatedProgress = Math.min(100, Math.max(0, Math.round((calculatedCurrentValue / goal.target_value) * 100)));
      }
    }
    // 2. Assignment / Task-based goal (or default when assignments exist)
    else if (asgnStats.total > 0 || unit === 'tasks' || unit === 'assignments' || unit === 'assignment' || unit === 'task') {
      calculatedCurrentValue = asgnStats.completed;
      if (goal.target_value && goal.target_value > 0) {
        calculatedProgress = Math.min(100, Math.max(0, Math.round((calculatedCurrentValue / goal.target_value) * 100)));
      } else if (asgnStats.active_total > 0) {
        calculatedProgress = asgnStats.completion_rate;
      } else if (asgnStats.total > 0 && asgnStats.active_total === 0) {
        // All assignments were cancelled
        calculatedProgress = 0;
      }
    }
    // 3. If only study sessions are linked and no explicit unit was specified
    else if (studyStats.total_sessions > 0) {
      calculatedCurrentValue = studyStats.completed_hours;
      if (goal.target_value && goal.target_value > 0) {
        calculatedProgress = Math.min(100, Math.max(0, Math.round((calculatedCurrentValue / goal.target_value) * 100)));
      } else {
        calculatedProgress = studyStats.total_sessions > 0
          ? Math.round((studyStats.completed_sessions / studyStats.total_sessions) * 100)
          : 0;
      }
    }

    const updates = {
      progress: calculatedProgress,
      current_value: calculatedCurrentValue
    };

    // Auto-update status and completion timestamp
    if (calculatedProgress >= 100) {
      updates.status = 'completed';
      updates.completed_at = goal.completed_at || Date.now();
    } else if (goal.status === 'completed' && calculatedProgress < 100) {
      updates.status = 'in_progress';
      updates.completed_at = null;
    }

    return this.goalRepo.update(goalId, updates);
  }
}

const goalService = new GoalService();

module.exports = {
  GoalService,
  goalService
};
