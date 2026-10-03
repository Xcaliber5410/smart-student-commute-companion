/**
 * Service-Level Test Suite: StudyResourceService
 *
 * Verifies:
 * 1. CRUD operations for study resources.
 * 2. Strict student ownership and authorization guards (string userId and object user).
 * 3. Schema and payload validation (rejection of invalid types, titles, tags).
 * 4. Relational integrity (rejecting foreign or non-existent courses, assignments, goals, sessions).
 * 5. Linking and unlinking operations across all supported entities.
 * 6. Listing, type filtering, relational filtering, and metadata search.
 * 7. Archive and favorite toggles.
 * 8. Safe deletion and domain isolation (no corruptive cascades to academic entities).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_resource_service.db');
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}
process.env.DATABASE_PATH = testDbPath;
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { getConnection, closeConnection } = require('../db/connection');
const { runMigrations } = require('../migrations/migrationRunner');
const {
  User,
  Course,
  Assignment,
  Goal,
  StudySession,
  StudyResource
} = require('../models');
const {
  userRepository,
  courseRepository,
  assignmentRepository,
  goalRepository,
  studySessionRepository,
  studyResourceRepository
} = require('../repositories');
const { studyResourceService, StudyResourceService } = require('../services/studyResourceService');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError
} = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Study Resource Service Layer Test Suite');
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

  const db = getConnection(testDbPath);
  db.pragma('foreign_keys = ON');

  try {
    initDb();
    runMigrations(db);

    const testSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // -----------------------------------------------------------------
    // Setup Primary Student (Student A), Second Student (Student B), Admin
    // -----------------------------------------------------------------
    const studentA = User.create({
      id: `usr-svc-student-a-${testSuffix}`,
      email: `student_a_${testSuffix}@djsce.edu`,
      password: 'Password123!',
      full_name: 'Student A',
      college_name: 'DJ Sanghvi'
    });
    userRepository.create(studentA);

    const studentB = User.create({
      id: `usr-svc-student-b-${testSuffix}`,
      email: `student_b_${testSuffix}@djsce.edu`,
      password: 'Password123!',
      full_name: 'Student B',
      college_name: 'DJ Sanghvi'
    });
    userRepository.create(studentB);

    const adminUser = {
      id: `usr-svc-admin-${testSuffix}`,
      role: 'admin',
      email: `admin_${testSuffix}@djsce.edu`
    };

    // Academic entities for Student A
    const courseA = Course.create({
      id: `crs-svc-algo-${testSuffix}`,
      user_id: studentA.id,
      name: 'Advanced Algorithms',
      code: 'CS501'
    });
    courseRepository.create(courseA);

    const goalA = Goal.create({
      id: `goal-svc-graph-${testSuffix}`,
      user_id: studentA.id,
      course_id: courseA.id,
      title: 'Master Graph Algorithms'
    });
    goalRepository.create(goalA);

    const assignmentA = Assignment.create({
      id: `asgn-svc-tsp-${testSuffix}`,
      user_id: studentA.id,
      course_id: courseA.id,
      goal_id: goalA.id,
      title: 'TSP Dynamic Programming Problem',
      due_date: Date.now() + 86400000 * 5
    });
    assignmentRepository.create(assignmentA);

    const sessionA = StudySession.create({
      id: `sess-svc-dp-${testSuffix}`,
      user_id: studentA.id,
      course_id: courseA.id,
      assignment_id: assignmentA.id,
      goal_id: goalA.id,
      title: 'DP Graph Optimization Session',
      planned_start_time: Date.now() + 3600000,
      planned_duration_minutes: 90
    });
    studySessionRepository.create(sessionA);

    // Academic entities for Student B
    const courseB = Course.create({
      id: `crs-svc-os-${testSuffix}`,
      user_id: studentB.id,
      name: 'Operating Systems',
      code: 'CS502'
    });
    courseRepository.create(courseB);

    const assignmentB = Assignment.create({
      id: `asgn-svc-kern-${testSuffix}`,
      user_id: studentB.id,
      course_id: courseB.id,
      title: 'Kernel Driver Lab',
      due_date: Date.now() + 86400000 * 3
    });
    assignmentRepository.create(assignmentB);

    const goalB = Goal.create({
      id: `goal-svc-os-${testSuffix}`,
      user_id: studentB.id,
      course_id: courseB.id,
      title: 'Build Simple Microkernel'
    });
    goalRepository.create(goalB);

    const sessionB = StudySession.create({
      id: `sess-svc-os-${testSuffix}`,
      user_id: studentB.id,
      course_id: courseB.id,
      title: 'OS Lab Prep',
      planned_start_time: Date.now() + 3600000,
      planned_duration_minutes: 60
    });
    studySessionRepository.create(sessionB);

    // =================================================================
    // 1. CRUD Operations
    // =================================================================
    let resource1;

    test('CRUD: createResource creates note with defaults and associations', () => {
      resource1 = studyResourceService.createResource(studentA.id, {
        title: 'Bellman-Ford & Dijkstra Comparison',
        description: 'Complexity analysis and negative cycle detection',
        resource_type: 'note',
        content: '# Single Source Shortest Path\nDijkstra: O((V+E)logV)\nBellman-Ford: O(VE)',
        tags: ['algorithms', 'graphs', 'shortest-path'],
        course_id: courseA.id,
        assignment_id: assignmentA.id,
        goal_id: goalA.id,
        study_session_id: sessionA.id
      });

      assert.ok(resource1 && resource1.id);
      assert.strictEqual(resource1.user_id, studentA.id);
      assert.strictEqual(resource1.title, 'Bellman-Ford & Dijkstra Comparison');
      assert.strictEqual(resource1.resource_type, 'note');
      assert.strictEqual(resource1.course_id, courseA.id);
      assert.strictEqual(resource1.assignment_id, assignmentA.id);
      assert.strictEqual(resource1.goal_id, goalA.id);
      assert.strictEqual(resource1.study_session_id, sessionA.id);
      assert.strictEqual(resource1.is_favorite, 0);
      assert.strictEqual(resource1.archived, 0);
      assert.ok(Array.isArray(resource1.tags));
      assert.strictEqual(resource1.tags.length, 3);
    });

    test('CRUD: getResourceById retrieves resource for owning student', () => {
      const fetched = studyResourceService.getResourceById(resource1.id, studentA.id);
      assert.ok(fetched);
      assert.strictEqual(fetched.id, resource1.id);
      assert.strictEqual(fetched.title, resource1.title);
    });

    test('CRUD: getResourceById works with student user object', () => {
      const fetched = studyResourceService.getResourceById(resource1.id, { id: studentA.id, role: 'student' });
      assert.ok(fetched);
      assert.strictEqual(fetched.id, resource1.id);
    });

    test('CRUD: updateResource updates title, content, and metadata', () => {
      const updated = studyResourceService.updateResource(resource1.id, studentA.id, {
        title: 'Shortest Path Algorithms: Dijkstra & Bellman-Ford',
        description: 'Updated with Johnson algorithm notes',
        content: '# SSSP\nUpdated summary with SPFA.',
        tags: ['algorithms', 'graphs', 'johnson']
      });

      assert.strictEqual(updated.title, 'Shortest Path Algorithms: Dijkstra & Bellman-Ford');
      assert.strictEqual(updated.description, 'Updated with Johnson algorithm notes');
      assert.deepStrictEqual(updated.tags, ['algorithms', 'graphs', 'johnson']);
      assert.strictEqual(updated.course_id, courseA.id); // preserved
    });

    test('CRUD: deleteResource removes resource', () => {
      const toDelete = studyResourceService.createResource(studentA.id, {
        title: 'Disposable Scratchpad Note',
        resource_type: 'note'
      });
      assert.ok(toDelete && toDelete.id);

      const deleted = studyResourceService.deleteResource(toDelete.id, studentA.id);
      assert.strictEqual(deleted, true);

      assert.throws(() => {
        studyResourceService.getResourceById(toDelete.id, studentA.id);
      }, err => err instanceof NotFoundError);
    });

    // =================================================================
    // 2. Student Ownership & Cross-Student Isolation
    // =================================================================
    test('Ownership: Student B cannot view Student A resource (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.getResourceById(resource1.id, studentB.id);
      }, err => err instanceof ForbiddenError);
    });

    test('Ownership: Student B cannot update Student A resource (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.updateResource(resource1.id, studentB.id, { title: 'Tampered Title' });
      }, err => err instanceof ForbiddenError);
    });

    test('Ownership: Student B cannot delete Student A resource (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.deleteResource(resource1.id, studentB.id);
      }, err => err instanceof ForbiddenError);
    });

    test('Ownership: Student B cannot create resource on behalf of Student A (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Impersonated Resource'
        }, { id: studentB.id, role: 'student' });
      }, err => err instanceof ForbiddenError);
    });

    test('Ownership: Admin can view and manage any student resource', () => {
      const adminView = studyResourceService.getResourceById(resource1.id, adminUser);
      assert.ok(adminView);
      assert.strictEqual(adminView.id, resource1.id);
    });

    // =================================================================
    // 3. Schema & Input Validation
    // =================================================================
    test('Validation: rejects empty title or whitespace-only title', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: '   ',
          resource_type: 'note'
        });
      }, err => err instanceof ValidationError);
    });

    test('Validation: rejects invalid resource type', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Valid Title',
          resource_type: 'forbidden_type'
        });
      }, err => err instanceof ValidationError);
    });

    test('Validation: accepts camelCase input and normalizes correctly', () => {
      const camelRes = studyResourceService.createResource(studentA.id, {
        title: 'GeeksforGeeks SSSP Guide',
        resourceType: 'link',
        url: 'https://geeksforgeeks.org/shortest-path-algorithms',
        courseId: courseA.id,
        isFavorite: true
      });

      assert.strictEqual(camelRes.resource_type, 'link');
      assert.strictEqual(camelRes.course_id, courseA.id);
      assert.strictEqual(camelRes.is_favorite, 1);
    });

    test('Validation: normalizes comma-separated string tags into an array', () => {
      const tagged = studyResourceService.createResource(studentA.id, {
        title: 'String Tagged Resource',
        tags: 'math, dynamic-programming, graph'
      });
      assert.deepStrictEqual(tagged.tags, ['math', 'dynamic-programming', 'graph']);
    });

    // =================================================================
    // 4. Relational Integrity & Cross-Student Entity Checks
    // =================================================================
    test('Relationships: rejects linking to non-existent course (NotFoundError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Ghost Course Resource',
          course_id: 'non-existent-course-404'
        });
      }, err => err instanceof NotFoundError);
    });

    test('Relationships: rejects linking to another student\'s course (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Student A using Student B Course',
          course_id: courseB.id // belongs to student B!
        });
      }, err => err instanceof ForbiddenError);
    });

    test('Relationships: rejects linking to another student\'s assignment (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Student A using Student B Assignment',
          assignment_id: assignmentB.id
        });
      }, err => err instanceof ForbiddenError);
    });

    test('Relationships: rejects linking to another student\'s goal (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Student A using Student B Goal',
          goal_id: goalB.id
        });
      }, err => err instanceof ForbiddenError);
    });

    test('Relationships: rejects linking to another student\'s study session (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(studentA.id, {
          title: 'Student A using Student B Session',
          study_session_id: sessionB.id
        });
      }, err => err instanceof ForbiddenError);
    });

    // =================================================================
    // 5. Linking and Unlinking Operations
    // =================================================================
    let linkableRes;

    test('Linking: creates unlinked resource and links to entities via linkResource', () => {
      linkableRes = studyResourceService.createResource(studentA.id, {
        title: 'Stand-alone Reference Material',
        resource_type: 'reference',
        content: 'Initial unlinked reference'
      });
      assert.strictEqual(linkableRes.course_id, null);
      assert.strictEqual(linkableRes.assignment_id, null);

      const linked = studyResourceService.linkResource(linkableRes.id, studentA.id, {
        course_id: courseA.id,
        assignment_id: assignmentA.id
      });
      assert.strictEqual(linked.course_id, courseA.id);
      assert.strictEqual(linked.assignment_id, assignmentA.id);
    });

    test('Linking: dedicated helper linkToGoal and linkToStudySession work cleanly', () => {
      const withGoal = studyResourceService.linkToGoal(linkableRes.id, studentA.id, goalA.id);
      assert.strictEqual(withGoal.goal_id, goalA.id);

      const withSession = studyResourceService.linkToStudySession(linkableRes.id, studentA.id, sessionA.id);
      assert.strictEqual(withSession.study_session_id, sessionA.id);
    });

    test('Unlinking: dedicated unlinkFromCourse unlinks course while keeping others intact', () => {
      const unlinkedCourse = studyResourceService.unlinkFromCourse(linkableRes.id, studentA.id);
      assert.strictEqual(unlinkedCourse.course_id, null);
      assert.strictEqual(unlinkedCourse.assignment_id, assignmentA.id);
      assert.strictEqual(unlinkedCourse.goal_id, goalA.id);
      assert.strictEqual(unlinkedCourse.study_session_id, sessionA.id);
    });

    test('Unlinking: unlinkResource supports array of entity types', () => {
      const unlinkedBoth = studyResourceService.unlinkResource(linkableRes.id, studentA.id, ['assignment', 'goal']);
      assert.strictEqual(unlinkedBoth.assignment_id, null);
      assert.strictEqual(unlinkedBoth.goal_id, null);
      assert.strictEqual(unlinkedBoth.study_session_id, sessionA.id);
    });

    test('Unlinking: unlinkResource("all") clears all remaining entity associations', () => {
      const unlinkedAll = studyResourceService.unlinkResource(linkableRes.id, studentA.id, 'all');
      assert.strictEqual(unlinkedAll.course_id, null);
      assert.strictEqual(unlinkedAll.assignment_id, null);
      assert.strictEqual(unlinkedAll.goal_id, null);
      assert.strictEqual(unlinkedAll.study_session_id, null);
    });

    test('Unlinking: rejects invalid entity type with BadRequestError', () => {
      assert.throws(() => {
        studyResourceService.unlinkResource(linkableRes.id, studentA.id, 'invalid_entity_type');
      }, err => err instanceof BadRequestError);
    });

    // =================================================================
    // 6. Listing, Type Filtering, and Relational Retrieval
    // =================================================================
    test('Listing: getResources returns paginated results scoped to student', () => {
      const result = studyResourceService.getResources(studentA.id, { page: 1, limit: 10 });
      assert.ok(result);
      assert.ok(Array.isArray(result.data));
      assert.ok(result.total >= 2);
      assert.strictEqual(result.page, 1);
      assert.strictEqual(result.limit, 10);
      assert.ok(result.data.every(r => r.user_id === studentA.id));
    });

    test('Filtering: getResourcesByType returns only requested type', () => {
      const notes = studyResourceService.getResourcesByType(studentA.id, 'note');
      assert.ok(notes.data.every(r => r.resource_type === 'note'));

      const links = studyResourceService.getResourcesByType(studentA.id, 'link');
      assert.ok(links.data.every(r => r.resource_type === 'link'));
    });

    test('Filtering: getResourcesByCourse returns only resources linked to that course', () => {
      const courseResources = studyResourceService.getResourcesByCourse(studentA.id, courseA.id);
      assert.ok(courseResources.length >= 1);
      assert.ok(courseResources.every(r => r.course_id === courseA.id && r.user_id === studentA.id));
    });

    test('Filtering: getResourcesByAssignment, Goal, and StudySession return correct items', () => {
      const asgnRes = studyResourceService.getResourcesByAssignment(studentA.id, assignmentA.id);
      assert.ok(asgnRes.every(r => r.assignment_id === assignmentA.id));

      const goalRes = studyResourceService.getResourcesByGoal(studentA.id, goalA.id);
      assert.ok(goalRes.every(r => r.goal_id === goalA.id));

      const sessRes = studyResourceService.getResourcesByStudySession(studentA.id, sessionA.id);
      assert.ok(sessRes.every(r => r.study_session_id === sessionA.id));
    });

    // =================================================================
    // 7. Metadata Search & Status Operations
    // =================================================================
    test('Search: searchResources matches across title, description, content, and tags', () => {
      const docRes = studyResourceService.createResource(studentA.id, {
        title: 'Tarjan Strongly Connected Components',
        description: 'Linear time algorithm using depth-first search low-link values',
        resource_type: 'document',
        file_name: 'tarjan_scc_analysis.pdf',
        tags: ['tarjan', 'dfs', 'scc']
      });

      // Match by title
      const titleSearch = studyResourceService.searchResources(studentA.id, 'Tarjan');
      assert.ok(titleSearch.data.some(r => r.id === docRes.id));

      // Match by description
      const descSearch = studyResourceService.searchResources(studentA.id, 'low-link');
      assert.ok(descSearch.data.some(r => r.id === docRes.id));

      // Match by file_name
      const fileSearch = studyResourceService.searchResources(studentA.id, 'analysis.pdf');
      assert.ok(fileSearch.data.some(r => r.id === docRes.id));

      // Match by tag
      const tagSearch = studyResourceService.searchResources(studentA.id, 'scc');
      assert.ok(tagSearch.data.some(r => r.id === docRes.id));

      // Student B searching for Tarjan finds nothing
      const studentBSearch = studyResourceService.searchResources(studentB.id, 'Tarjan');
      assert.strictEqual(studentBSearch.total, 0);
    });

    test('Status: toggleFavorite, archiveResource, and unarchiveResource work correctly', () => {
      const faved = studyResourceService.toggleFavorite(resource1.id, studentA.id);
      assert.strictEqual(faved.is_favorite, 1);

      const archived = studyResourceService.archiveResource(resource1.id, studentA.id);
      assert.strictEqual(archived.archived, 1);

      const unarchived = studyResourceService.unarchiveResource(resource1.id, studentA.id);
      assert.strictEqual(unarchived.archived, 0);
    });

    // =================================================================
    // 8. Safe Deletion & Domain Preservation
    // =================================================================
    test('Safe Deletion: deleting resource does not alter course, assignment, or goal', () => {
      const resToDelete = studyResourceService.createResource(studentA.id, {
        title: 'Doomed Note',
        course_id: courseA.id,
        assignment_id: assignmentA.id,
        goal_id: goalA.id
      });

      // Delete the study resource
      studyResourceService.deleteResource(resToDelete.id, studentA.id);

      // Verify the academic entities are still completely intact
      const courseStillThere = courseRepository.findById(courseA.id);
      const asgnStillThere = assignmentRepository.findById(assignmentA.id);
      const goalStillThere = goalRepository.findById(goalA.id);

      assert.ok(courseStillThere, 'Course must remain intact');
      assert.ok(asgnStillThere, 'Assignment must remain intact');
      assert.ok(goalStillThere, 'Goal must remain intact');
    });

    console.log('\n----------------------------------------------------');
    console.log(` STUDY RESOURCE SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------------------');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (_) {}
    }
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
