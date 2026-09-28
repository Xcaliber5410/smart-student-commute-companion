/**
 * Notification and Reminder Routes
 *
 * Exposes authenticated endpoints for student notifications and reminders.
 */

const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');
const {
  validate,
  idParamSchema,
  notificationFilterSchema,
  bulkReadNotificationSchema,
  createReminderSchema,
  updateReminderSchema,
  reminderFilterSchema
} = require('../validators');

function createNotificationRoutes() {
  const router = express.Router();

  // Guard all notification and reminder endpoints with authentication
  router.use(authenticate);

  // -------------------------------------------------------------
  // Notification Endpoints
  // -------------------------------------------------------------
  router.get(
    '/notifications',
    validate(notificationFilterSchema, 'query'),
    notificationController.listNotifications
  );

  router.get(
    '/notifications/unread',
    validate(notificationFilterSchema, 'query'),
    notificationController.listUnreadNotifications
  );

  router.get(
    '/notifications/count',
    notificationController.getUnreadCount
  );

  router.get(
    '/notifications/:id',
    validate(idParamSchema, 'params'),
    notificationController.getNotification
  );

  router.patch(
    '/notifications/:id/read',
    validate(idParamSchema, 'params'),
    notificationController.markAsRead
  );

  router.post(
    '/notifications/read-all',
    notificationController.markAllAsRead
  );

  router.post(
    '/notifications/read-multiple',
    validate(bulkReadNotificationSchema, 'body'),
    notificationController.markMultipleAsRead
  );

  router.delete(
    '/notifications/:id',
    validate(idParamSchema, 'params'),
    notificationController.deleteNotification
  );

  // -------------------------------------------------------------
  // Reminder Endpoints
  // -------------------------------------------------------------
  router.get(
    '/reminders',
    validate(reminderFilterSchema, 'query'),
    notificationController.listReminders
  );

  router.post(
    '/reminders',
    validate(createReminderSchema, 'body'),
    notificationController.createReminder
  );

  router.get(
    '/reminders/:id',
    validate(idParamSchema, 'params'),
    notificationController.getReminder
  );

  router.patch(
    '/reminders/:id',
    validate(idParamSchema, 'params'),
    validate(updateReminderSchema, 'body'),
    notificationController.updateReminder
  );

  router.post(
    '/reminders/:id/trigger',
    validate(idParamSchema, 'params'),
    notificationController.triggerReminder
  );

  router.post(
    '/reminders/:id/complete',
    validate(idParamSchema, 'params'),
    notificationController.completeReminder
  );

  router.post(
    '/reminders/:id/cancel',
    validate(idParamSchema, 'params'),
    notificationController.cancelReminder
  );

  router.delete(
    '/reminders/:id',
    validate(idParamSchema, 'params'),
    notificationController.deleteReminder
  );

  return router;
}

module.exports = createNotificationRoutes;
