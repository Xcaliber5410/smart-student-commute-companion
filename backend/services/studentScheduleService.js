/**
 * StudentScheduleService
 *
 * Core student workflow service for recurring commute schedules and class routines.
 */

const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class StudentScheduleService {
  constructor(scheduleRepo = studentScheduleRepository, userRepo = userRepository) {
    this.scheduleRepo = scheduleRepo;
    this.userRepo = userRepo;
  }

  assertOwnership(schedule, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student schedule');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === schedule.user_id) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to manage another student schedule');
  }

  createSchedule(userId, input, requestingUser) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only create schedules for your own account');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const created = this.scheduleRepo.create({
      ...input,
      user_id: userId
    });

    return created.toJSON();
  }

  getStudentSchedules(userId, requestingUser, options = {}) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only view your own schedules');
    }

    const schedules = this.scheduleRepo.findByUserId(userId, options);
    return schedules.map(s => s.toJSON());
  }

  getScheduleById(scheduleId, requestingUser) {
    const schedule = this.scheduleRepo.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundError(`Commute schedule with id '${scheduleId}' not found`);
    }

    this.assertOwnership(schedule, requestingUser);
    return schedule.toJSON();
  }

  updateSchedule(scheduleId, updates, requestingUser) {
    const existing = this.scheduleRepo.findById(scheduleId);
    if (!existing) {
      throw new NotFoundError(`Commute schedule with id '${scheduleId}' not found`);
    }

    this.assertOwnership(existing, requestingUser);
    const updated = this.scheduleRepo.update(scheduleId, updates);
    return updated.toJSON();
  }

  toggleScheduleActive(scheduleId, requestingUser) {
    const existing = this.scheduleRepo.findById(scheduleId);
    if (!existing) {
      throw new NotFoundError(`Commute schedule with id '${scheduleId}' not found`);
    }

    this.assertOwnership(existing, requestingUser);
    const updated = this.scheduleRepo.update(scheduleId, { active: !existing.active });
    return updated.toJSON();
  }

  deleteSchedule(scheduleId, requestingUser) {
    const existing = this.scheduleRepo.findById(scheduleId);
    if (!existing) {
      throw new NotFoundError(`Commute schedule with id '${scheduleId}' not found`);
    }

    this.assertOwnership(existing, requestingUser);
    return this.scheduleRepo.delete(scheduleId);
  }
}

const studentScheduleService = new StudentScheduleService();

module.exports = {
  StudentScheduleService,
  studentScheduleService
};
