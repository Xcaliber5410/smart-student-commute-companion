/**
 * GoalService
 *
 * Business logic and authorization guards for student goals and progress tracking.
 */

const { goalRepository } = require('../repositories/GoalRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
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
    userRepo = userRepository
  ) {
    this.goalRepo = goalRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
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
}

const goalService = new GoalService();

module.exports = {
  GoalService,
  goalService
};
