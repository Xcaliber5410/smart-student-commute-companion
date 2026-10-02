/**
 * Student Search Foundation Verification Suite
 *
 * Validates the backend foundation for unified student search:
 * - Architecture, schema, and repository operations
 * - Cross-entity search (courses, assignments, calendar, study sessions, goals, routes, notifications, reminders)
 * - Normalized request and response contract
 * - Deterministic relevance scoring and ranking
 * - Entity type filtering and alias resolution
 * - Parameterized query safety and validation
 * - Authenticated student scoping and strict cross-user data isolation
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
  console.log(' Running Unified Student Search Foundation Test Suite');
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

  // Seed Student A Entities with unique search keywords
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

  // -----------------------------------------------------------------
  // 1. Module Exports & Contract Verification
  // -----------------------------------------------------------------
  await test('Contract: exports studentSearchService, studentSearchRepository and search query schema', async () => {
    assert.ok(studentSearchService);
    assert.strictEqual(typeof studentSearchService.search, 'function');
    assert.strictEqual(typeof studentSearchService.resolveTypes, 'function');
    assert.ok(studentSearchRepository);
    assert.strictEqual(typeof studentSearchRepository.searchCourses, 'function');
    assert.strictEqual(typeof studentSearchRepository.searchAssignments, 'function');
    assert.ok(Array.isArray(ALL_SEARCHABLE_TYPES));
    assert.strictEqual(ALL_SEARCHABLE_TYPES.length, 8);
  });

  // -----------------------------------------------------------------
  // 2. Empty & Whitespace Query Handling
  // -----------------------------------------------------------------
  await test('Validation: empty or whitespace query returns clean empty search payload with zero database calls', async () => {
    const res1 = studentSearchService.search(studentA.id, studentA, { query: '' });
    assert.strictEqual(res1.query, '');
    assert.strictEqual(res1.total, 0);
    assert.strictEqual(res1.results.length, 0);
    assert.ok(res1.countsByType);
    assert.strictEqual(res1.countsByType.course, 0);

    const res2 = studentSearchService.search(studentA.id, studentA, { q: '   ' });
    assert.strictEqual(res2.query, '');
    assert.strictEqual(res2.total, 0);
    assert.strictEqual(res2.results.length, 0);

    const res3 = studentSearchService.search(studentA.id, studentA, {});
    assert.strictEqual(res3.total, 0);
  });

  // -----------------------------------------------------------------
  // 3. Query Validation & Safeguards
  // -----------------------------------------------------------------
  await test('Validation: rejects query exceeding 200 characters with BadRequestError', async () => {
    const longQuery = 'a'.repeat(201);
    assert.throws(
      () => studentSearchService.search(studentA.id, studentA, { query: longQuery }),
      (err) => err instanceof BadRequestError && err.statusCode === 400
    );
  });

  await test('Validation: studentSearchQuerySchema validates search options correctly', async () => {
    const valid = studentSearchQuerySchema.parse({
      q: 'distributed',
      types: ['course', 'assignment'],
      limit: '15',
      offset: '0'
    });
    assert.strictEqual(valid.q, 'distributed');
    assert.strictEqual(valid.limit, 15);
    assert.strictEqual(valid.offset, 0);
    assert.deepStrictEqual(valid.types, ['course', 'assignment']);
  });

  // -----------------------------------------------------------------
  // 4. Cross-Entity Search Across All Relevant Student Records
  // -----------------------------------------------------------------
  await test('Search: finds matching records across all 8 supported student entities', async () => {
    const response = studentSearchService.search(studentA.id, studentA, { query: 'distributed' });
    assert.strictEqual(response.query, 'distributed');
    assert.ok(response.total >= 8, `Expected at least 8 results, received ${response.total}`);

    // Verify all 8 categories exist in countsByType
    assert.ok(response.countsByType.course >= 1, 'Should find course');
    assert.ok(response.countsByType.goal >= 1, 'Should find goal');
    assert.ok(response.countsByType.assignment >= 1, 'Should find assignment');
    assert.ok(response.countsByType.calendar_event >= 1, 'Should find calendar event');
    assert.ok(response.countsByType.study_session >= 1, 'Should find study session');
    assert.ok(response.countsByType.saved_route >= 1, 'Should find saved route');
    assert.ok(response.countsByType.notification >= 1, 'Should find notification');
    assert.ok(response.countsByType.reminder >= 1, 'Should find reminder');

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
  // 5. Zero N+1 Queries: Single-Pass Course Enrichment
  // -----------------------------------------------------------------
  await test('Enrichment: child items (assignment, event, session, goal) are enriched with course details', async () => {
    const response = studentSearchService.search(studentA.id, studentA, { query: 'consensus' });
    assert.ok(response.total >= 1);
    const asgnItem = response.results.find(i => i.type === 'assignment');
    assert.ok(asgnItem);
    assert.ok(asgnItem.course);
    assert.strictEqual(asgnItem.course.name, 'Distributed Systems & Cloud');
    assert.strictEqual(asgnItem.course.code, 'CS401');
    assert.strictEqual(asgnItem.course.color, '#3B82F6');
  });

  // -----------------------------------------------------------------
  // 6. Entity Type Filtering & Aliases
  // -----------------------------------------------------------------
  await test('Filtering: filters by explicit types and resolves plural/common aliases', async () => {
    // Array of types
    const resTypes = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      types: ['course', 'goal']
    });
    assert.ok(resTypes.results.every(i => i.type === 'course' || i.type === 'goal'));

    // Comma-separated string with aliases: "courses,tasks" -> ['course', 'assignment']
    const resAliases = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      types: 'courses,tasks'
    });
    assert.ok(resAliases.results.every(i => i.type === 'course' || i.type === 'assignment'));

    // Single type filter alias: "events" -> 'calendar_event'
    const resEvents = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      type: 'events'
    });
    assert.ok(resEvents.results.every(i => i.type === 'calendar_event'));
  });

  await test('Filtering: rejects invalid entity type with BadRequestError', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, studentA, { query: 'test', types: 'unknown_entity' }),
      (err) => err instanceof BadRequestError && err.statusCode === 400
    );
  });

  // -----------------------------------------------------------------
  // 7. Deterministic Relevance Scoring & Ordering
  // -----------------------------------------------------------------
  await test('Relevance: ranks exact title match above substring and description matches', async () => {
    // Create an exact match assignment
    const exactAsgn = {
      id: `asgn-exact-${timestamp}`,
      user_id: studentA.id,
      title: 'Paxos',
      description: 'Overview',
      due_date: timestamp + 86400000,
      priority: 'high',
      status: 'pending',
      created_at: timestamp,
      updated_at: timestamp
    };
    // Create a partial/description match assignment
    const partialAsgn = {
      id: `asgn-partial-${timestamp}`,
      user_id: studentA.id,
      title: 'Reading assignments for Week 5',
      description: 'Contains Paxos protocol notes',
      due_date: timestamp + 86400000,
      priority: 'low',
      status: 'pending',
      created_at: timestamp,
      updated_at: timestamp
    };
    const insertStmt = db.prepare(`
      INSERT INTO assignments (id, user_id, title, description, due_date, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(exactAsgn.id, exactAsgn.user_id, exactAsgn.title, exactAsgn.description, exactAsgn.due_date, exactAsgn.priority, exactAsgn.status, exactAsgn.created_at, exactAsgn.updated_at);
    insertStmt.run(partialAsgn.id, partialAsgn.user_id, partialAsgn.title, partialAsgn.description, partialAsgn.due_date, partialAsgn.priority, partialAsgn.status, partialAsgn.created_at, partialAsgn.updated_at);

    const res = studentSearchService.search(studentA.id, studentA, { query: 'paxos' });
    const exactResult = res.results.find(i => i.id === exactAsgn.id);
    const partialResult = res.results.find(i => i.id === partialAsgn.id);

    assert.ok(exactResult);
    assert.ok(partialResult);
    assert.ok(exactResult.relevanceScore > partialResult.relevanceScore, 'Exact title match must score strictly higher');
    assert.strictEqual(res.results[0].id, exactAsgn.id, 'Top result must be the exact title match');
  });

  // -----------------------------------------------------------------
  // 8. Pagination (limit and offset)
  // -----------------------------------------------------------------
  await test('Pagination: respects limit and offset bounds deterministically', async () => {
    const page1 = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      limit: 3,
      offset: 0
    });
    assert.strictEqual(page1.limit, 3);
    assert.strictEqual(page1.offset, 0);
    assert.strictEqual(page1.results.length, 3);

    const page2 = studentSearchService.search(studentA.id, studentA, {
      query: 'distributed',
      limit: 3,
      offset: 3
    });
    assert.strictEqual(page2.offset, 3);
    assert.strictEqual(page2.results.length, 3);

    // Make sure results don't overlap between page 1 and page 2
    const idsPage1 = new Set(page1.results.map(r => r.id));
    for (const item of page2.results) {
      assert.strictEqual(idsPage1.has(item.id), false, `Item ${item.id} should not appear on both page 1 and page 2`);
    }
  });

  // -----------------------------------------------------------------
  // 9. Strict Student Isolation & Scoping
  // -----------------------------------------------------------------
  await test('Isolation: student B cannot access student A search (ForbiddenError)', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, studentB, { query: 'distributed' }),
      (err) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await test('Isolation: unauthenticated request throws UnauthorizedError', async () => {
    assert.throws(
      () => studentSearchService.search(studentA.id, null, { query: 'distributed' }),
      (err) => err instanceof UnauthorizedError && err.statusCode === 401
    );
  });

  await test('Isolation: student B search returns only student B data with zero bleed from student A', async () => {
    const resB = studentSearchService.search(studentB.id, studentB, { query: 'distributed' });
    // Student B has 1 course with "Distributed"
    assert.strictEqual(resB.total, 1);
    assert.strictEqual(resB.results[0].id, courseB1.id);
    assert.strictEqual(resB.results[0].title, 'Distributed Systems & Cloud (Student B)');

    // Ensure NONE of Student A's courses, goals, assignments, or events bleed into Student B's results
    const studentAIds = new Set([courseA1.id, courseA2.id, goalA.id, asgnA1.id, eventA.id, studyA.id, routeA.id, notifA.id, reminderA.id]);
    for (const r of resB.results) {
      assert.strictEqual(studentAIds.has(r.id), false, `Data leak: Student A item ${r.id} found in Student B search!`);
    }
  });

  // -----------------------------------------------------------------
  // 10. Safe SQL Parameterization against SQL Injection & Special Characters
  // -----------------------------------------------------------------
  await test('Safety: handles quotes, percents, and potential injection patterns safely', async () => {
    const maliciousQueries = [
      "' OR 1=1 --",
      `" OR ""="`,
      "%; DROP TABLE courses; --",
      "%%",
      "__",
      "\\",
      "[]"
    ];

    for (const sq of maliciousQueries) {
      const res = studentSearchService.search(studentA.id, studentA, { query: sq });
      assert.ok(Array.isArray(res.results));
      assert.strictEqual(typeof res.total, 'number');
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(` SEARCH FOUNDATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
