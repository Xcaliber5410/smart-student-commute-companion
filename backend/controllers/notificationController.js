/**
 * Notification & Reminder Controller
 *
 * Exposes standardized API handlers for student notifications, read state
 * management, unread count tracking, and reminder lifecycle operations.
 */

const { notificationService } = require('../services/notificationService');
const { reminderService } = require('../services/reminderService');
const { success, created, paginated } = require('../utils/apiResponse');

// -------------------------------------------------------------
// Notification Handlers
// -------------------------------------------------------------

async function listNotifications(req, res, next) {
  try {
    const result = notificationService.listStudentNotifications(req.user.id, req.user, req.query);
    return paginated(res, {
      dataKey: 'notifications',
      data: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount
    });
  } catch (err) {
    next(err);
  }
}

async function listUnreadNotifications(req, res, next) {
  try {
    const result = notificationService.listStudentNotifications(req.user.id, req.user, {
      ...req.query,
      read: false
    });
    return paginated(res, {
      dataKey: 'notifications',
      data: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount
    });
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const result = notificationService.getUnreadCount(req.user.id, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function getNotification(req, res, next) {
  try {
    const notification = notificationService.getNotificationById(req.params.id, req.user);
    return success(res, { notification });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const notification = notificationService.markAsRead(req.params.id, req.user);
    return success(res, { notification });
  } catch (err) {
    next(err);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    const result = notificationService.markAllAsRead(req.user.id, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function markMultipleAsRead(req, res, next) {
  try {
    const result = notificationService.markMultipleAsRead(req.user.id, req.body.ids, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function deleteNotification(req, res, next) {
  try {
    notificationService.deleteNotification(req.params.id, req.user);
    return success(res, { id: req.params.id, deleted: true });
  } catch (err) {
    next(err);
  }
}

// -------------------------------------------------------------
// Reminder Handlers
// -------------------------------------------------------------

async function listReminders(req, res, next) {
  try {
    const result = reminderService.listStudentReminders(req.user.id, req.user, req.query);
    return paginated(res, {
      dataKey: 'reminders',
      data: result.reminders,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
}

async function createReminder(req, res, next) {
  try {
    const reminder = reminderService.createReminder(req.user.id, req.body, req.user);
    return created(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function getReminder(req, res, next) {
  try {
    const reminder = reminderService.getReminderById(req.params.id, req.user);
    return success(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function updateReminder(req, res, next) {
  try {
    const reminder = reminderService.updateReminder(req.params.id, req.body, req.user);
    return success(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function triggerReminder(req, res, next) {
  try {
    const reminder = reminderService.triggerReminder(req.params.id, req.user);
    return success(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function completeReminder(req, res, next) {
  try {
    const reminder = reminderService.completeReminder(req.params.id, req.user);
    return success(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function cancelReminder(req, res, next) {
  try {
    const reminder = reminderService.cancelReminder(req.params.id, req.user);
    return success(res, { reminder });
  } catch (err) {
    next(err);
  }
}

async function deleteReminder(req, res, next) {
  try {
    reminderService.deleteReminder(req.params.id, req.user);
    return success(res, { id: req.params.id, deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  listUnreadNotifications,
  getUnreadCount,
  getNotification,
  markAsRead,
  markAllAsRead,
  markMultipleAsRead,
  deleteNotification,
  listReminders,
  createReminder,
  getReminder,
  updateReminder,
  triggerReminder,
  completeReminder,
  cancelReminder,
  deleteReminder
};
