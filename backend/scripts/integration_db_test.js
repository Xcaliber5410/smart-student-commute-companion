/**
 * Database Foundation Integration Test Suite
 *
 * Runs comprehensive integration tests against an isolated SQLite test database:
 * 1. Connection lifecycle and status inspection.
 * 2. Automated schema migration execution (up and down).
 * 3. Domain model validation and invariant logic.
 * 4. Repository persistence, querying, and transactional voting.
 * 5. Constraint violation handling and error normalization.
 *
 * Ensures ZERO mutation of production data.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { getConnection, closeConnection, ping, getConnectionStatus } = require('../db/connection');
const { runMigrations, rollbackMigration, getMigrationStatus } = require('../migrations/migrationRunner');
const { RideGroup } = require('../models/RideGroup');
const { LiveReport } = require('../models/LiveReport');
const { Feedback } = require('../models/Feedback');
const { GeocodingCache } = require('../models/GeocodingCache');
const { User } = require('../models/User');
const { RideGroupRepository } = require('../repositories/RideGroupRepository');
const { ReportRepository } = require('../repositories/ReportRepository');
const { FeedbackRepository } = require('../repositories/FeedbackRepository');
const { GeocodingRepository } = require('../repositories/GeocodingRepository');
const { UserRepository } = require('../repositories/UserRepository');
const { normalizeDatabaseError } = require('../db/dbErrors');
const { ConflictError, ValidationError } = require('../errors');

console.log('====================================================');
console.log(' Running Database Foundation Integration Tests');
console.log('====================================================\n');

const TEST_DB_PATH = path.resolve(__dirname, '../db/test_integration_runner.db');

// Ensure clean slate before test run
function cleanupTestDb() {
  closeConnection();
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (e) {
      // Ignore if locked by Windows filesystem momentarily
    }
  }
}

let passed = 0;
let failed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(`   ${err.stack || err.message}`);
    failed++;
  }
}

async function runAsyncTest(testName, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${testName}`);
    console.error(`   ${err.stack || err.message}`);
    failed++;
  }
}

async function main() {
  cleanupTestDb();

  let testDb;

  try {
    // -------------------------------------------------------------
    // Test Section 1: Centralized Connection Lifecycle
    // -------------------------------------------------------------
    runTest('Centralized connection initializes on isolated test database', () => {
      testDb = getConnection(TEST_DB_PATH);
      assert(testDb, 'Database instance must be returned');
      const status = getConnectionStatus();
      assert.equal(status.isConnected, true, 'Connection status must report isConnected = true');
      assert.equal(status.path, TEST_DB_PATH, 'Connection must point to test database');
    });

    runTest('Connection ping validates active SQLite query engine', () => {
      const pingResult = ping();
      assert.equal(pingResult.ok, true, 'Ping ok flag must be true');
      assert(typeof pingResult.driver === 'string', 'Driver name must be reported');
    });

    // -------------------------------------------------------------
    // Test Section 2: Schema Migrations (Initial Migration UP)
    // -------------------------------------------------------------
    runTest('Migration runner applies initial schema migration to test database', () => {
      const results = runMigrations(testDb);
      assert(results.applied.length > 0, 'At least one migration must be applied');
      assert.equal(results.applied[0], '001_initial_schema', '001_initial_schema must be applied');

      // Verify schema_migrations table contains recorded migration
      const recorded = testDb.prepare('SELECT * FROM schema_migrations WHERE name = ?').get('001_initial_schema');
      assert(recorded, 'Migration record must exist in schema_migrations');

      // Verify essential tables exist
      const tables = testDb.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      ).all().map(t => t.name);

      const requiredTables = [
        'schema_migrations',
        'live_commute_reports',
        'live_report_confirmations',
        'ride_groups',
        'feedback',
        'geocoding_cache',
        'users',
        'student_profiles',
        'student_schedules',
        'saved_routes',
        'ride_group_members',
        'notifications',
        'reminders'
      ];

      for (const reqTable of requiredTables) {
        assert(tables.includes(reqTable), `Required table '${reqTable}' must exist in migrated schema`);
      }
    });

    runTest('Migration status reports clean state with no pending migrations', () => {
      const status = getMigrationStatus(testDb);
      assert.equal(status.applied.length, 4);
      assert.equal(status.pending.length, 0);
    });

    // -------------------------------------------------------------
    // Test Section 3: Domain Models Invariant & Validation Logic
    // -------------------------------------------------------------
    runTest('RideGroup domain model enforces member capacity and defaults', () => {
      const rg = RideGroup.create({
        creator_pseudonym: 'Aarav Mehta',
        origin_area: 'Andheri West',
        destination_college: 'DJ Sanghvi College',
        departure_time: '08:30 AM',
        mode: 'auto',
        max_members: 3
      });

      assert.equal(rg.current_members, 1);
      assert.equal(rg.isFull(), false);

      rg.current_members = 3;
      assert.equal(rg.isFull(), true);
    });

    runTest('LiveReport domain model computes expiry based on timestamp', () => {
      const now = Date.now();
      const report = LiveReport.create({
        area: 'Dadar Station',
        mode: 'train',
        message: 'Platform 3 heavy congestion and train delayed by 15 mins',
        created_at: now,
        expires_at: now + 3600000
      });

      assert.equal(report.isExpired(now), false);
      assert.equal(report.isExpired(now + 4000000), true);
    });

    runTest('User domain model securely hashes passwords and validates invariants', () => {
      const user = User.create({
        email: 'Student.Test@DJSCE.ac.in',
        password: 'SecurePassword123',
        full_name: 'Aditya Verma',
        college_name: 'DJ Sanghvi College of Engineering'
      });

      assert.equal(user.email, 'student.test@djsce.ac.in');
      assert.equal(user.role, 'student');
      assert(user.password_hash.includes(':'), 'Hash must contain salt separator');
      assert(!user.password_hash.includes('SecurePassword123'), 'Plaintext password must never appear in hash');
      assert.equal(user.verifyPassword('SecurePassword123'), true);
      assert.equal(user.verifyPassword('WrongPassword'), false);

      const safeObj = user.toSafeObject();
      assert(!('password_hash' in safeObj), 'toSafeObject() must redact password_hash');
      const json = JSON.parse(JSON.stringify(user));
      assert(!('password_hash' in json), 'toJSON() must redact password_hash');
    });

    // -------------------------------------------------------------
    // Test Section 4: Repository Data-Access Layer Integration
    // -------------------------------------------------------------
    const rideGroupRepo = new RideGroupRepository(testDb);
    const reportRepo = new ReportRepository(testDb);
    const feedbackRepo = new FeedbackRepository(testDb);
    const geocodingRepo = new GeocodingRepository(testDb);
    const userRepo = new UserRepository(testDb);

    let createdGroupId;

    runTest('RideGroupRepository persists and retrieves student ride groups', () => {
      const created = rideGroupRepo.create({
        creator_pseudonym: 'Priya Sharma',
        origin_area: 'Borivali Station',
        destination_college: 'Mithibai College',
        departure_time: '09:00 AM',
        mode: 'metro',
        max_members: 4,
        notes: 'Meet near entrance gate 2'
      });

      assert(created.id, 'Created ride group must have an ID');
      createdGroupId = created.id;

      const fetched = rideGroupRepo.findById(createdGroupId);
      assert(fetched, 'Must retrieve group by ID');
      assert.equal(fetched.creator_pseudonym, 'Priya Sharma');
      assert.equal(fetched.current_members, 1);
      assert.equal(fetched.max_members, 4);
    });

    runTest('RideGroupRepository incrementMembers updates group membership and closes when full', () => {
      rideGroupRepo.incrementMembers(createdGroupId);
      rideGroupRepo.incrementMembers(createdGroupId);
      const finalGroup = rideGroupRepo.incrementMembers(createdGroupId);

      assert.equal(finalGroup.current_members, 4);
      assert.equal(finalGroup.isFull(), true);
    });

    let testReportId;

    runTest('ReportRepository persists live report and calculates active queries', () => {
      const now = Date.now();
      const report = reportRepo.create({
        pseudonym: 'Student_Commuter_99',
        area: 'Bandra West',
        mode: 'bus',
        message: 'Heavy water logging near Linking Road, BEST bus route 211 diverted',
        impact: 'high',
        created_at: now,
        expires_at: now + 3600000
      });

      assert(report.id, 'Report must be created with ID');
      testReportId = report.id;

      const active = reportRepo.findActive(now);
      assert(active.some(r => r.id === testReportId), 'Active reports query must include newly created report');
    });

    runTest('ReportRepository addVote records community confirmation and prevents duplicate votes', () => {
      const userToken = 'student-user-token-abc';
      const firstVote = reportRepo.addVote(testReportId, userToken, 'confirm');

      assert.equal(firstVote.alreadyVoted, false);
      assert.equal(firstVote.updatedReport.confirmation_count, 1);

      // Attempt second vote from same user
      const secondVote = reportRepo.addVote(testReportId, userToken, 'confirm');
      assert.equal(secondVote.alreadyVoted, true);
    });

    runTest('FeedbackRepository records student feedback and computes ratings', () => {
      feedbackRepo.create({
        recommendation_id: 'rec-test-101',
        is_useful: true,
        tags: ['Fast', 'Low Crowding'],
        comment: 'Western line fast local recommended was accurate!'
      });

      feedbackRepo.create({
        recommendation_id: 'rec-test-101',
        is_useful: true,
        tags: ['Accurate'],
        comment: 'Good connection'
      });

      feedbackRepo.create({
        recommendation_id: 'rec-test-101',
        is_useful: false,
        tags: ['Crowded'],
        comment: 'Train was too crowded'
      });

      const list = feedbackRepo.findByRecommendationId('rec-test-101');
      assert.equal(list.length, 3, 'Must return 3 feedback entries');

      const summary = feedbackRepo.getRatingSummary('rec-test-101');
      assert.equal(summary.total, 3);
      assert.equal(summary.helpful, 2);
      assert.equal(summary.notHelpful, 1);
      assert.equal(summary.helpfulPercentage, 67);
    });

    runTest('GeocodingRepository caches lookup coordinates and supports idempotent upsert', () => {
      const cached = geocodingRepo.upsert({
        query: 'dj sanghvi college vile parle',
        lat: 19.1075,
        lon: 72.8372,
        display_name: 'Dwarkadas J. Sanghvi College of Engineering, Vile Parle, Mumbai'
      });

      assert.equal(cached.lat, 19.1075);

      const retrieved = geocodingRepo.findByQuery('dj sanghvi college vile parle');
      assert(retrieved, 'Must find cached geocode');
      assert.equal(retrieved.lon, 72.8372);
    });

    runTest('UserRepository persists and retrieves student user accounts', () => {
      const createdUser = userRepo.create({
        email: 'priya.sharma@vjti.ac.in',
        password: 'ValidPassword123',
        full_name: 'Priya Sharma',
        college_name: 'VJTI Matunga'
      });

      assert(createdUser.id.startsWith('usr-'), 'User ID must start with usr-');
      const byEmail = userRepo.findByEmail('PRIYA.SHARMA@VJTI.AC.IN');
      assert(byEmail, 'Must find user case-insensitively');
      assert.equal(byEmail.full_name, 'Priya Sharma');

      const byId = userRepo.findById(createdUser.id);
      assert(byId, 'Must find user by ID');
      assert.equal(byId.college_name, 'VJTI Matunga');
      assert.equal(byId.verifyPassword('ValidPassword123'), true);
      assert.equal(userRepo.count() >= 1, true);
    });

    // -------------------------------------------------------------
    // Test Section 5: Constraint Violations & Error Normalization
    // -------------------------------------------------------------
    runTest('Duplicate primary key insertion is caught and normalized to ConflictError', () => {
      let caughtError = null;
      try {
        testDb.prepare(`
          INSERT INTO ride_groups (id, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, current_members, notes, created_at)
          VALUES (?, 'Duplicate Host', 'A', 'B', '10:00', 'bus', 3, 1, '', 123456)
        `).run(createdGroupId);
      } catch (err) {
        caughtError = normalizeDatabaseError(err);
      }

      assert(caughtError, 'Duplicate insertion must throw an error');
      assert(caughtError instanceof ConflictError, 'Error must normalize to ConflictError');
      assert.equal(caughtError.statusCode, 409);
      assert.equal(caughtError.code, 'DUPLICATE_RECORD');
      assert(!caughtError.message.includes('ride_groups'), 'Sanitized error must not leak table name');
    });

    runTest('Duplicate user email insertion is caught and normalized to ConflictError', () => {
      let caughtError = null;
      try {
        testDb.prepare(`
          INSERT INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
          VALUES ('usr-dup', 'priya.sharma@vjti.ac.in', 'hash123', 'Another User', 'VJTI', 'student', 123, 123)
        `).run();
      } catch (err) {
        caughtError = normalizeDatabaseError(err);
      }

      assert(caughtError, 'Duplicate email insertion must throw an error');
      assert(caughtError instanceof ConflictError, 'Error must normalize to ConflictError');
      assert.equal(caughtError.statusCode, 409);
      assert.equal(caughtError.code, 'DUPLICATE_RECORD');
    });

    // -------------------------------------------------------------
    // Test Section 6: Schema Rollback & Re-migration
    // -------------------------------------------------------------
    runTest('Migration runner safely rolls back latest schema migration', () => {
      const rollbackResult = rollbackMigration(testDb);
      assert.equal(rollbackResult.rolledBack, '004_notifications_and_reminders');

      const statusAfterRollback = getMigrationStatus(testDb);
      assert.equal(statusAfterRollback.applied.length, 3);
      assert.equal(statusAfterRollback.pending.length, 1);
    });

    runTest('Migration runner can cleanly re-apply migrations after rollback', () => {
      const reapplyResult = runMigrations(testDb);
      assert.equal(reapplyResult.applied.length, 1);

      const statusAfterReapply = getMigrationStatus(testDb);
      assert.equal(statusAfterReapply.applied.length, 4);
      assert.equal(statusAfterReapply.pending.length, 0);
    });

  } finally {
    // -------------------------------------------------------------
    // Teardown: Safely close connection and cleanup test database
    // -------------------------------------------------------------
    cleanupTestDb();
  }

  console.log('\n----------------------------------------------------');
  console.log(` DATABASE INTEGRATION TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
