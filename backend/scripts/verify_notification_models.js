/**
 * Verification Script: Student Notification & Reminder Domain Models & Migration 004
 */

const assert = require('assert');
const { Notification, notificationSchema, Reminder, reminderSchema } = require('../models');
const { getConnection } = require('../db/connection');
const { MigrationRunner } = require('../migrations/migrationRunner');

async function run() {
  console.log('====================================================');
  console.log(' Running Notification Domain Models & Migration 004 Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Notification Model Validation & Defaults
  test('Notification: instantiates and validates defaults', () => {
    const notif = Notification.create({
      user_id: 'usr-student-1',
      title: 'Commute Reminder',
      message: 'Time to leave for morning lecture'
    });

    assert.ok(notif.id.startsWith('notif-'));
    assert.strictEqual(notif.user_id, 'usr-student-1');
    assert.strictEqual(notif.type, 'reminder');
    assert.strictEqual(notif.priority, 'medium');
    assert.strictEqual(notif.read, false);
    assert.strictEqual(notif.read_at, undefined);
    assert.ok(notif.created_at > 0);
  });

  // 2. Notification Read Lifecycle
  test('Notification: toggles read state and timestamp', () => {
    const notif = Notification.create({
      user_id: 'usr-student-1',
      title: 'Alert',
      message: 'Train delays on Western Line'
    });

    assert.strictEqual(notif.read, false);
    const readTime = Date.now();
    notif.markAsRead(readTime);
    assert.strictEqual(notif.read, true);
    assert.strictEqual(notif.read_at, readTime);

    notif.markAsUnread();
    assert.strictEqual(notif.read, false);
    assert.strictEqual(notif.read_at, null);
  });

  // 3. Notification Row and JSON Serialization
  test('Notification: serializes to/from DB row with payload object', () => {
    const notif = Notification.create({
      user_id: 'usr-student-1',
      type: 'disruption',
      title: 'Route Warning',
      message: 'Waterlogging near Milan Subway',
      priority: 'high',
      payload: { routeId: 'route-123', alternateMode: 'metro' }
    });

    const row = notif.toRow();
    assert.strictEqual(typeof row.payload, 'string');
    assert.strictEqual(row.read, 0);

    const hydrated = Notification.fromRow(row);
    assert.strictEqual(hydrated.id, notif.id);
    assert.strictEqual(hydrated.type, 'disruption');
    assert.strictEqual(hydrated.priority, 'high');
    assert.strictEqual(hydrated.payload.routeId, 'route-123');
    assert.strictEqual(hydrated.payload.alternateMode, 'metro');
  });

  // 4. Reminder Model Lifecycle & Validation
  test('Reminder: instantiates and transitions status lifecycle', () => {
    const rem = Reminder.create({
      user_id: 'usr-student-1',
      title: 'Board 08:30 Churchgate Fast',
      scheduled_time: Date.now() + 3600000,
      reminder_type: 'commute'
    });

    assert.ok(rem.id.startsWith('rem-'));
    assert.strictEqual(rem.status, 'scheduled');
    assert.strictEqual(rem.triggered_at, undefined);

    // Trigger
    const triggerTime = Date.now();
    rem.trigger(triggerTime);
    assert.strictEqual(rem.status, 'triggered');
    assert.strictEqual(rem.triggered_at, triggerTime);

    // Complete
    rem.complete(triggerTime + 1000);
    assert.strictEqual(rem.status, 'completed');
  });

  // 5. Database Schema & Tables Check
  test('Database: notifications and reminders tables exist in SQLite', () => {
    const db = getConnection();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notifications', 'reminders')
    `).all();

    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('notifications'), 'notifications table exists');
    assert.ok(tableNames.includes('reminders'), 'reminders table exists');
  });

  // 6. Database Indexes Check
  test('Database: indexes for notifications and reminders exist', () => {
    const db = getConnection();
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index' AND (
        name LIKE 'idx_notifications_%' OR name LIKE 'idx_reminders_%'
      )
    `).all().map(i => i.name);

    assert.ok(indexes.includes('idx_notifications_user_id'));
    assert.ok(indexes.includes('idx_notifications_user_read'));
    assert.ok(indexes.includes('idx_notifications_user_created'));
    assert.ok(indexes.includes('idx_reminders_user_id'));
    assert.ok(indexes.includes('idx_reminders_user_status'));
    assert.ok(indexes.includes('idx_reminders_scheduled_status'));
  });

  console.log('\n----------------------------------------------------');
  console.log(` NOTIFICATION DOMAIN MODELS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
