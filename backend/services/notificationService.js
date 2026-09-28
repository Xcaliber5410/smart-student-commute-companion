/**
 * NotificationService
 *
 * Core service managing student notifications, read state transitions,
 * unread count calculations, and cross-student ownership enforcement.
 */

const { notificationRepository } = require('../repositories/NotificationRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class NotificationService {
  constructor(notifRepo = notificationRepository, userRepo = userRepository) {
    this.notifRepo = notifRepo;
    this.userRepo = userRepo;
  }

  /**
   * Asserts requesting user owns the notification or target user data, or is admin.
   */
  assertOwnership(target, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access notification resources');
    }

    const targetUserId = typeof target === 'string' ? target : target.user_id;

    if (requestingUser.role === 'admin' || requestingUser.id === targetUserId) {
      return true;
    }

    throw new ForbiddenError('Access forbidden: you do not have permission to manage notifications for another student');
  }

  /**
   * Creates a notification for a student user.
   */
  createNotification(userId, input) {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestError('User ID is required to create a notification');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const created = this.notifRepo.create({
      ...input,
      user_id: userId
    });

    return created.toJSON();
  }

  /**
   * Retrieves a single notification by ID.
   */
  getNotificationById(id, requestingUser) {
    const notification = this.notifRepo.findById(id);
    if (!notification) {
      throw new NotFoundError(`Notification with id '${id}' not found`);
    }

    this.assertOwnership(notification, requestingUser);
    return notification.toJSON();
  }

  /**
   * Lists notifications for an authenticated student with pagination and filtering.
   */
  listStudentNotifications(userId, requestingUser, options = {}) {
    this.assertOwnership(userId, requestingUser);

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const result = this.notifRepo.findWithPaginationAndFilters(userId, options);

    return {
      notifications: result.data.map(n => n.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      },
      unreadCount: result.unreadCount
    };
  }

  /**
   * Retrieves the unread notification count for a student.
   */
  getUnreadCount(userId, requestingUser) {
    this.assertOwnership(userId, requestingUser);

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const unreadCount = this.notifRepo.getUnreadCount(userId);
    return { unreadCount };
  }

  /**
   * Marks a single notification as read.
   */
  markAsRead(id, requestingUser) {
    const notification = this.notifRepo.findById(id);
    if (!notification) {
      throw new NotFoundError(`Notification with id '${id}' not found`);
    }

    this.assertOwnership(notification, requestingUser);

    const updated = this.notifRepo.markAsRead(id);
    return updated.toJSON();
  }

  /**
   * Marks all unread notifications as read for a student.
   */
  markAllAsRead(userId, requestingUser) {
    this.assertOwnership(userId, requestingUser);

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const count = this.notifRepo.markAllAsRead(userId);
    return { updatedCount: count };
  }

  /**
   * Marks multiple notifications as read.
   */
  markMultipleAsRead(userId, ids, requestingUser) {
    this.assertOwnership(userId, requestingUser);

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError('Array of notification IDs is required');
    }

    const count = this.notifRepo.markMultipleAsRead(userId, ids);
    return { updatedCount: count };
  }

  /**
   * Deletes a notification.
   */
  deleteNotification(id, requestingUser) {
    const notification = this.notifRepo.findById(id);
    if (!notification) {
      throw new NotFoundError(`Notification with id '${id}' not found`);
    }

    this.assertOwnership(notification, requestingUser);

    this.notifRepo.delete(id);
    return { success: true };
  }
}

const notificationService = new NotificationService();

module.exports = {
  NotificationService,
  notificationService
};
