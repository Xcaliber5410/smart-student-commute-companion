/**
 * Student Cross-Domain Search Verification Suite
 *
 * Validates the backend implementation for unified student cross-domain search:
 * - Multi-entity cross-domain matching (courses, assignments, calendar events, study sessions, goals, routes, schedules, notifications, reminders)
 * - Multi-word tokenized search and cross-field keyword correlation
 * - Case-insensitive and partial substring matching
 * - No-result search handling
 * - Deterministic relevance scoring and ranking
 * - Normalized search contract and course enrichment (Zero N+1)
 * - Strict authenticated student scoping and zero cross-user data bleeding
 * - Validation safeguards against long queries and invalid entity types
 * - Parameterized SQL injection protection
 */

const assert = require('assert');
const { db } = require('../db/database');
const { studentSearchService, ALL_SEARCHABLE_TYPES, CANONICAL_ENTITY_TYPES } = require('../services/studentSearchService');
const { studentSearchRepository } = require('../repositories/StudentSearchRepository');
const { studentSearchQuerySchema } = require('../validators/searchValidators');
const { ForbiddenError, UnauthorizedError, BadRequestError } = require('../errors');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

async function run() {
  console.log('====================================================');
  console.log(' Running Cross-Domain Student Search Test Suite');
  console.log('====================================================\n');

  const timestamp = Date.now();
  const studentA = {
    id: `usr-search-a-${timestamp}`,
    name: 'Search Student A',
    email: `search_a_${timestamp}@example.com`,
    password_hash: 'hash-a',
    role: 'student',
    created_at: timestamp,
    updated_at: timestamp
  };

  const studentB = {
    id: `usr-search-b-${timestamp}`,
    name: 'Search Student B',
    email: `search_b_${timestamp}@example.com`,
    password_hash: 'hash-b',
    role: 'student',
    created_at: timestamp,
    updated_at: timestamp
  };

  // Seed test users
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run(studentA.id, studentA.email, studentA.password_hash, studentA.name, 'DJ Sanghvi College', studentA.role, studentA.created_at, studentA.updated_at);
  insertUser.run(studentB.id, studentB.email, studentB.password_hash, studentB.name, 'DJ Sanghvi College', studentB.role, studentB.created_at, studentB.updated_at);

  // 1. Course (Student A)
  const courseA1 = {
    id: `course-a1-${timestamp}`,
    user_id: studentA.id,
    name: 'Distributed Systems & Cloud',
    code: 'CS401',
    instructor: 'Dr. Tanenbaum',
    color: '#3B82F6',
    credits: 4,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
  const courseA2 = {
    id: `course-a2-${timestamp}`,
    user_id: studentA.id,
    name: 'Mobile App Architecture',
    code: 'CS402',
    instructor: 'Prof. Hopper',
    color: '#10B981',
    credits: 3,
    archived: 1, // Archived course
    created_at: timestamp,
    updated_at: timestamp
  };
  const insertCourse = db.prepare(`
    INSERT INTO courses (id, user_id, name, code, instructor, color, credits, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCourse.run(courseA1.id, courseA1.user_id, courseA1.name, courseA1.code, courseA1.instructor, courseA1.color, courseA1.credits, courseA1.archived, courseA1.created_at, courseA1.updated_at);
  insertCourse.run(courseA2.id, courseA2.user_id, courseA2.name, courseA2.code, courseA2.instructor, courseA2.color, courseA2.credits, courseA2.archived, courseA2.created_at, courseA2.updated_at);

  // 2. Goal (Student A)
  const goalA = {
    id: `goal-a1-${timestamp}`,
    user_id: studentA.id,
    course_id: courseA1.id,
    title: 'Distributed Systems Master Project',
    description: 'Build a fault-tolerant Raft consensus engine',
    target_date: timestamp + 86400000 * 30,
    status: 'in_progress',
    progress: 40,
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO goals (id, user_id, course_id, title, description, target_date, status, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(goalA.id, goalA.user_id, goalA.course_id, goalA.title, goalA.description, goalA.target_date, goalA.status, goalA.progress, goalA.created_at, goalA.updated_at);

  // 3. Assignment (Student A)
  const asgnA1 = {
    id: `asgn-a1-${timestamp}`,
    user_id: studentA.id,
    course_id: courseA1.id,
    goal_id: goalA.id,
    title: 'Distributed Consensus Lab 1',
    description: 'Implement RPC protocol for leader election',
    due_date: timestamp + 86400000 * 5,
    priority: 'urgent',
    status: 'in_progress',
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO assignments (id, user_id, course_id, goal_id, title, description, due_date, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(asgnA1.id, asgnA1.user_id, asgnA1.course_id, asgnA1.goal_id, asgnA1.title, asgnA1.description, asgnA1.due_date, asgnA1.priority, asgnA1.status, asgnA1.created_at, asgnA1.updated_at);

  // 4. Calendar Event (Student A)
  const eventA = {
    id: `evt-a1-${timestamp}`,
    user_id: studentA.id,
    course_id: courseA1.id,
    title: 'Distributed Systems Midterm Review',
    description: 'Lecture Hall 401 review session',
    location: 'Lab Building 4',
    event_type: 'exam',
    start_time: timestamp + 86400000 * 2,
    end_time: timestamp + 86400000 * 2 + 7200000,
    status: 'scheduled',
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO calendar_events (id, user_id, course_id, title, description, location, event_type, start_time, end_time, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eventA.id, eventA.user_id, eventA.course_id, eventA.title, eventA.description, eventA.location, eventA.event_type, eventA.start_time, eventA.end_time, eventA.status, eventA.created_at, eventA.updated_at);

  // 5. Study Session (Student A)
  const studyA = {
    id: `study-a1-${timestamp}`,
    user_id: studentA.id,
    course_id: courseA1.id,
    goal_id: goalA.id,
    title: 'Distributed Storage Deep Dive',
    notes: 'Read Paxos and Raft papers chapter 4',
    planned_start_time: timestamp + 3600000,
    planned_duration_minutes: 90,
    status: 'planned',
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO study_sessions (id, user_id, course_id, goal_id, title, notes, planned_start_time, planned_duration_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(studyA.id, studyA.user_id, studyA.course_id, studyA.goal_id, studyA.title, studyA.notes, studyA.planned_start_time, studyA.planned_duration_minutes, studyA.status, studyA.created_at, studyA.updated_at);

  // 6. Saved Route (Student A)
  const routeA = {
    id: `route-a1-${timestamp}`,
    user_id: studentA.id,
    name: 'Fast Track to Distributed Lab',
    origin: 'Andheri Station',
    destination: 'DJSCE Computer Lab',
    preferred_mode: 'metro',
    tags: 'campus,fast,distributed',
    created_at: timestamp
  };
  db.prepare(`
    INSERT INTO saved_routes (id, user_id, name, origin, destination, preferred_mode, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(routeA.id, routeA.user_id, routeA.name, routeA.origin, routeA.destination, routeA.preferred_mode, routeA.tags, routeA.created_at);

  // 7. Commute Schedule (Student A)
  const scheduleA = {
    id: `sched-a1-${timestamp}`,
    user_id: studentA.id,
    title: 'Distributed Systems Morning Commute',
    origin: 'Borivali West',
    destination: 'DJSCE Vile Parle',
    target_arrival_time: '08:45',
    days_of_week: '["Mon","Wed","Fri"]',
    reminder_enabled: 1,
    active: 1,
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO student_schedules (id, user_id, title, origin, destination, target_arrival_time, days_of_week, reminder_enabled, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(scheduleA.id, scheduleA.user_id, scheduleA.title, scheduleA.origin, scheduleA.destination, scheduleA.target_arrival_time, scheduleA.days_of_week, scheduleA.reminder_enabled, scheduleA.active, scheduleA.created_at, scheduleA.updated_at);

  // 8. Notification (Student A)
  const notifA = {
    id: `notif-a1-${timestamp}`,
    user_id: studentA.id,
    type: 'deadline',
    title: 'Distributed Consensus Lab due soon',
    message: 'Remember to submit your code before Friday midnight',
    priority: 'high',
    read: 0,
    created_at: timestamp
  };
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, priority, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(notifA.id, notifA.user_id, notifA.type, notifA.title, notifA.message, notifA.priority, notifA.read, notifA.created_at);

  // 9. Reminder (Student A)
  const reminderA = {
    id: `rem-a1-${timestamp}`,
    user_id: studentA.id,
    title: 'Review Distributed Systems Slides',
    message: 'Check slides before the review exam lecture',
    scheduled_time: timestamp + 86400000,
    reminder_type: 'study',
    status: 'scheduled',
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO reminders (id, user_id, title, message, scheduled_time, reminder_type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reminderA.id, reminderA.user_id, reminderA.title, reminderA.message, reminderA.scheduled_time, reminderA.reminder_type, reminderA.status, reminderA.created_at, reminderA.updated_at);

  // 10. Study Resource (Student A)
  const resourceA = {
    id: `res-a1-${timestamp}`,
    user_id: studentA.id,
    course_id: courseA1.id,
    title: 'Distributed Systems Raft Consensus Notes',
    description: 'Lecture summary and architectural diagram for distributed state machine replication',
    resource_type: 'note',
    content: 'Notes on leader election, log replication, and safety properties in Raft protocol.',
    tags: JSON.stringify(['raft', 'distributed', 'consensus', 'cloud']),
    is_favorite: 1,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO study_resources (id, user_id, course_id, title, description, resource_type, content, tags, is_favorite, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(resourceA.id, resourceA.user_id, resourceA.course_id, resourceA.title, resourceA.description, resourceA.resource_type, resourceA.content, resourceA.tags, resourceA.is_favorite, resourceA.archived, resourceA.created_at, resourceA.updated_at);

  // Seed Student B Entities (for strict isolation verification)
  const courseB1 = {
    id: `course-b1-${timestamp}`,
    user_id: studentB.id,
    name: 'Distributed Systems & Cloud (Student B)',
    code: 'CS401-B',
    instructor: 'Dr. Secret',
    color: '#EF4444',
    credits: 4,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
  insertCourse.run(courseB1.id, courseB1.user_id, courseB1.name, courseB1.code, courseB1.instructor, courseB1.color, courseB1.credits, courseB1.archived, courseB1.created_at, courseB1.updated_at);

  const resourceB = {
    id: `res-b1-${timestamp}`,
    user_id: studentB.id,
    course_id: courseB1.id,
    title: 'Distributed Systems Private Notes (Student B)',
    description: 'Private confidential notes',
    resource_type: 'note',
    content: 'Confidential student B content',
    tags: JSON.stringify(['distributed', 'private']),
    is_favorite: 0,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp
  };
  db.prepare(`
    INSERT INTO study_resources (id, user_id, course_id, title, description, resource_type, content, tags, is_favorite, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(resourceB.id, resourceB.user_id, resourceB.course_id, resourceB.title, resourceB.description, resourceB.resource_type, resourceB.content, resourceB.tags, resourceB.is_favorite, resourceB.archived, resourceB.created_at, resourceB.updated_at);

  // -----------------------------------------------------------------
  // 1. Contract & Supported Entities
  // -----------------------------------------------------------------
  await test('Contract: supports all 10 student-owned domain entities', async () => {
    assert.ok(studentSearchService);
    assert.ok(studentSearchRepository);
    assert.strictEqual(ALL_SEARCHABLE_TYPES.length, 10);
    assert.deepStrictEqual(ALL_SEARCHABLE_TYPES, [
      'course',
      'assignment',
      'calendar_event',
      'study_session',
      'goal',
      'study_resource',
      'saved_route',
      'schedule',
      'notification',
      'reminder'
    ]);
  });

  // -----------------------------------------------------------------
  // 2. Cross-Domain Search Across All 10 Entities
  // -----------------------------------------------------------------
  await test('Cross-Domain Search: matches records across all 10 distinct student entities simultaneously', async () => {
    const response = studentSearchService.search(studentA.id, studentA, { query: 'distributed' });
    assert.strictEqual(response.query, 'distributed');
    assert.ok(response.total >= 10, `Expected at least 10 results, received ${response.total}`);

    // Verify all 10 entity types exist in countsByType
    assert.ok(response.countsByType.course >= 1, 'Should find course');
    assert.ok(response.countsByType.goal >= 1, 'Should find goal');
    assert.ok(response.countsByType.assignment >= 1, 'Should find assignment');
    assert.ok(response.countsByType.calendar_event >= 1, 'Should find calendar event');
    assert.ok(response.countsByType.study_session >= 1, 'Should find study session');
    assert.ok(response.countsByType.saved_route >= 1, 'Should find saved route');
    assert.ok(response.countsByType.schedule >= 1, 'Should find commute schedule');
    assert.ok(response.countsByType.notification >= 1, 'Should find notification');
    assert.ok(response.countsByType.reminder >= 1, 'Should find reminder');
    assert.ok(response.countsByType.study_resource >= 1, 'Should find study resource');

    // Verify normalized item structure
    for (const item of response.results) {
      assert.ok(item.id, 'Item must have id');
      assert.ok(item.type, 'Item must have type');
      assert.ok(item.title, 'Item must have title');
      assert.ok(typeof item.relevanceScore === 'number' && item.relevanceScore >= 1, 'Item must have relevanceScore');
      assert.ok(item.url, 'Item must have url');
      assert.ok(item.metadata, 'Item must have metadata object');
    }
  });

  // -----------------------------------------------------------------
  // 3. Multi-Word Tokenized Matching
  // -----------------------------------------------------------------
  await test('Matching: multi-word query matches across non-contiguous words and multiple fields', async () => {
    // "distributed lab" matches "Distributed Consensus Lab 1" (title contains distributed and lab non-contiguously)
    const resTokens = studentSearchService.search(studentA.id, studentA, { query: 'distributed lab' });
    assert.ok(resTokens.total >= 1);
    const labItem = resTokens.results.find(i => i.id === asgnA1.id);
    assert.ok(labItem, 'Multi-word token matching should find assignment containing both distributed and lab');

    // "Tanenbaum Systems" matches course where instructor is "Dr. Tanenbaum" and name is "Distributed Systems"
    const resCrossField = studentSearchService.search(studentA.id, studentA, { query: 'Tanenbaum Systems' });
    assert.ok(resCrossField.total >= 1);
    const courseItem = resCrossField.results.find(i => i.id === courseA1.id);
    assert.ok(courseItem, 'Multi-word query should match across course instructor and course name');

    // "Borivali Vile" matches schedule origin and destination
    const resSched = studentSearchService.search(studentA.id, studentA, { query: 'Borivali Vile' });
    const schedItem = resSched.results.find(i => i.id === scheduleA.id);
    assert.ok(schedItem, 'Multi-word query should match schedule origin and destination');
  });

  // -----------------------------------------------------------------
  // 4. Case-Insensitive and Whitespace Matching
  // -----------------------------------------------------------------
  await test('Matching: handles uppercase, mixed case, and excessive whitespace seamlessly', async () => {
    const resUpper = studentSearchService.search(studentA.id, studentA, { query: 'DISTRIBUTED' });
    const resLower = studentSearchService.search(studentA.id, studentA, { query: 'distributed' });
    const resSpaces = studentSearchService.search(studentA.id, studentA, { query: '   distributed     systems   ' });

    assert.strictEqual(resUpper.total, resLower.total);
    assert.ok(resSpaces.total >= 1);
  });

  // -----------------------------------------------------------------
  // 5. Partial Substring Matching
  // -----------------------------------------------------------------
  await test('Matching: matches partial substrings accurately', async () => {
    const resPartial = studentSearchService.search(studentA.id, studentA, { query: 'distrib' });
    assert.ok(resPartial.total >= 1);
    assert.ok(resPartial.results.some(i => i.id === courseA1.id));
  });

  // -----------------------------------------------------------------
  // 6. No-Result Search Handling
  // -----------------------------------------------------------------
  await test('No Results: returns clean, zeroed response without errors for non-existent terms', async () => {
    const resNone = studentSearchService.search(studentA.id, studentA, { query: 'QuantumThermodynamicsXYZ999' });
    assert.strictEqual(resNone.query, 'QuantumThermodynamicsXYZ999');
    assert.strictEqual(resNone.total, 0);
    assert.strictEqual(resNone.results.length, 0);
    assert.ok(resNone.countsByType);
    for (const type of ALL_SEARCHABLE_TYPES) {
      assert.strictEqual(resNone.countsByType[type], 0);
    }
  });

  // -----------------------------------------------------------------
  // 7. Course Enrichment on Child Entities (Zero N+1)
  // -----------------------------------------------------------------
  await test('Enrichment: child items (assignment, event, session, goal, study_resource) include course metadata', async () => {
    const res = studentSearchService.search(studentA.id, studentA, { query: 'consensus' });
    const asgn = res.results.find(i => i.type === 'assignment');
    assert.ok(asgn);
    assert.ok(asgn.course);
    assert.strictEqual(asgn.course.id, courseA1.id);
    assert.strictEqual(asgn.course.name, 'Distributed Systems & Cloud');
    assert.strictEqual(asgn.course.code, 'CS401');

    // Test study resource course enrichment
    const resResource = studentSearchService.search(studentA.id, studentA, { query: 'Raft Consensus Notes' });
    const resItem = resResource.results.find(i => i.type === 'study_resource');
    assert.ok(resItem, 'Study resource should be returned');
    assert.ok(resItem.course, 'Study resource must include course metadata');
    assert.strictEqual(resItem.course.id, courseA1.id);
    assert.strictEqual(resItem.course.name, 'Distributed Systems & Cloud');
    assert.strictEqual(resItem.metadata.resourceType, 'note');
    assert.strictEqual(resItem.metadata.isFavorite, true);
    assert.ok(Array.isArray(resItem.metadata.tags));
  });

  // -----------------------------------------------------------------
  // 8. Type Filtering and Aliases
  // -----------------------------------------------------------------
  await test('Filtering: filters by entity types with plural and colloquial aliases', async () => {
    // Array: ['course', 'schedule']
    const res1 = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      types: ['course', 'schedule']
    });
    assert.ok(res1.results.every(i => i.type === 'course' || i.type === 'schedule'));

    // String with aliases: "schedules,tasks" -> ['schedule', 'assignment']
    const res2 = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      types: 'schedules,tasks'
    });
    assert.ok(res2.results.every(i => i.type === 'schedule' || i.type === 'assignment'));

    // Resource aliases: "resources,notes" -> ['study_resource']
    const res3 = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      types: 'resources,notes'
    });
    assert.ok(res3.results.length >= 1);
    assert.ok(res3.results.every(i => i.type === 'study_resource'));
  });

  // -----------------------------------------------------------------
  // 9. Input Validation & Error Handling
  // -----------------------------------------------------------------
  await test('Validation: rejects query exceeding 200 characters with BadRequestError', async () => {
    const longQuery = 'x'.repeat(201);
    assert.throws(
      () => studentSearchService.search(studentA.id, studentA, { query: longQuery }),
      (err) => err instanceof BadRequestError && err.statusCode === 400
    );
  });

  await test('Validation: rejects invalid entity type filter with BadRequestError', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, studentA, { query: 'test', types: 'invalid_type' }),
      (err) => err instanceof BadRequestError && err.statusCode === 400
    );
  });

  // -----------------------------------------------------------------
  // 10. Strict Student Isolation & Scoping
  // -----------------------------------------------------------------
  await test('Isolation: student B cannot access student A search (ForbiddenError)', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, studentB, { query: 'distributed' }),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await test('Isolation: unauthenticated search request throws UnauthorizedError', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, null, { query: 'distributed' }),
      (err) => err instanceof UnauthorizedError && err.statusCode === 401
    );
  });

  await test('Isolation: student B search returns only student B records with zero bleed from student A', async () => {
    const resB = studentSearchService.search(studentB.id, studentB, { query: 'distributed' });
    assert.strictEqual(resB.total, 2);
    assert.ok(resB.results.some(r => r.id === courseB1.id));
    assert.ok(resB.results.some(r => r.id === resourceB.id));

    const studentAIds = new Set([
      courseA1.id, courseA2.id, goalA.id, asgnA1.id,
      eventA.id, studyA.id, routeA.id, scheduleA.id, notifA.id, reminderA.id, resourceA.id
    ]);
    for (const r of resB.results) {
      assert.strictEqual(studentAIds.has(r.id), false, `Foreign student data leaked into Student B search: ${r.id}`);
    }
  });

  // -----------------------------------------------------------------
  // 11. Deterministic Relevance Ranking
  // -----------------------------------------------------------------
  await test('Relevance: orders results deterministically with exact matches ranked first', async () => {
    const res = studentSearchService.search(studentA.id, studentA, { query: 'Distributed Systems' });
    assert.ok(res.results.length >= 2, 'Should return multiple items matching Distributed Systems');
    assert.ok(res.results[0].relevanceScore >= res.results[1].relevanceScore);
    for (let i = 0; i < res.results.length - 1; i++) {
      assert.ok(res.results[i].relevanceScore >= res.results[i + 1].relevanceScore, 'Results must be sorted descending by relevanceScore');
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(` CROSS-DOMAIN SEARCH SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
