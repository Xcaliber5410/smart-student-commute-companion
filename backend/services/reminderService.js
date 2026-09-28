/**
 * ReminderService
 *
 * Core service managing student reminders, lifecycle state machine,
 * schedule/ride-group relationship validation, and notification triggering.
 */

const { reminderRepository } = require('../repositories/ReminderRepository');
const { notificationService } = require('./notificationService');
const { userRepository } = require('../repositories/UserRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class ReminderService {
  constructor(
    remRepo = reminderRepository,
    notifSvc = notificationService,
    userRepo = userRepository,
    schedRepo = studentScheduleRepository,
    rgRepo = rideGroupRepository
  ) {
    this.remRepo = remRepo;
    this.notifSvc = notifSvc;
    this.userRepo = userRepo;
    this.schedRepo = schedRepo;
    this.rgRepo = rgRepo;
  }

  assertOwnership(target, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access reminder resources');
    }

    const targetUserId = typeof target === 'string' ? target : (target ? target.user_id : null);

    if (requestingUser.role === 'admin' || (targetUserId && requestingUser.id === targetUserId)) {
      return true;
    }

    throw new ForbiddenError('Access forbidden: you do not have permission to manage reminders for another student');
  }

  /**
   * Creates a student reminder with relation validation.
   */
  createReminder(userId, input, requestingUser) {
    this.assertOwnership(userId, requestingUser);

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    if (!input.title || typeof input.title !== 'string') {
      throw new BadRequestError('Reminder title is required');
    }

    if (!input.scheduled_time || Number(input.scheduled_time) <= 0) {
      throw new BadRequestError('Valid scheduled_time epoch timestamp is required');
    }

    // Validate related resources if specified
    if (input.related_resource_type === 'student_schedule' && input.related_resource_id) {
      const schedule = this.schedRepo.findById(input.related_resource_id);
      if (!schedule) {
        throw new NotFoundError(`Related student schedule '${input.related_resource_id}' not found`);
      }
      if (schedule.user_id !== userId && requestingUser.role !== 'admin') {
        throw new ForbiddenError('Cannot link reminder to another student\'s schedule');
      }
    }

    if (input.related_resource_type === 'ride_group' && input.related_resource_id) {
      const group = this.rgRepo.findById(input.related_resource_id);
      if (!group) {
        throw new NotFoundError(`Related ride group '${input.related_resource_id}' not found`);
      }
    }

    const created = this.remRepo.create({
      ...input,
      user_id: userId,
      status: 'scheduled'
    });

    return created.toJSON();
  }

  /**
   * Retrieves a reminder by ID.
   */
  getReminderById(id, requestingUser) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    this.assertOwnership(reminder, requestingUser);
    return reminder.toJSON();
  }

  /**
   * Lists reminders for a student with pagination and filtering.
   */
  listStudentReminders(userId, requestingUser, options = {}) {
    this.assertOwnership(userId, requestingUser);

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const result = this.remRepo.findWithPaginationAndFilters(userId, options);

    return {
      reminders: result.data.map(r => r.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    };
  }

  /**
   * Updates an existing scheduled reminder.
   */
  updateReminder(id, updates, requestingUser) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    this.assertOwnership(reminder, requestingUser);

    if (reminder.status === 'completed' || reminder.status === 'cancelled') {
      throw new BadRequestError(`Cannot edit a reminder that is already ${reminder.status}`);
    }

    const updated = this.remRepo.update(id, updates);
    return updated.toJSON();
  }

  /**
   * Triggers a reminder: transitions status to 'triggered' and generates a notification.
   */
  triggerReminder(id, requestingUser, timestamp = Date.now()) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    if (requestingUser) {
      this.assertOwnership(reminder, requestingUser);
    }

    if (reminder.status === 'cancelled') {
      throw new BadRequestError('Cannot trigger a cancelled reminder');
    }
    if (reminder.status === 'completed') {
      throw new BadRequestError('Cannot trigger an already completed reminder');
    }
    if (reminder.status === 'triggered') {
      // Idempotent: already triggered
      return reminder.toJSON();
    }

    const updated = this.remRepo.updateStatus(id, 'triggered', timestamp);

    // Create persistent notification for student
    this.notifSvc.createNotification(reminder.user_id, {
      type: 'reminder',
      title: reminder.title,
      message: reminder.message || `Reminder: ${reminder.title}`,
      priority: 'high',
      related_resource_type: reminder.related_resource_type || 'reminder',
      related_resource_id: reminder.id,
      payload: {
        reminderId: reminder.id,
        scheduledTime: reminder.scheduled_time
      }
    });

    return updated.toJSON();
  }

  /**
   * Completes a reminder.
   */
  completeReminder(id, requestingUser, timestamp = Date.now()) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    this.assertOwnership(reminder, requestingUser);

    if (reminder.status === 'cancelled') {
      throw new BadRequestError('Cannot complete a cancelled reminder');
    }

    const updated = this.remRepo.updateStatus(id, 'completed', timestamp);
    return updated.toJSON();
  }

  /**
   * Cancels a reminder.
   */
  cancelReminder(id, requestingUser, timestamp = Date.now()) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    this.assertOwnership(reminder, requestingUser);

    if (reminder.status === 'completed') {
      throw new BadRequestError('Cannot cancel an already completed reminder');
    }

    const updated = this.remRepo.updateStatus(id, 'cancelled', timestamp);
    return updated.toJSON();
  }

  /**
   * Deletes a reminder.
   */
  deleteReminder(id, requestingUser) {
    const reminder = this.remRepo.findById(id);
    if (!reminder) {
      throw new NotFoundError(`Reminder with id '${id}' not found`);
    }

    this.assertOwnership(reminder, requestingUser);

    this.remRepo.delete(id);
    return { success: true };
  }
}

const reminderService = new ReminderService();

module.exports = {
  ReminderService,
  reminderService
};
