/**
 * Verification Script: Student Study Resources Domain, Migration 009 & Service Layer
 *
 * Verifies:
 * 1. Migration 009 applies cleanly and creates schema, columns, and indexes.
 * 2. StudyResource domain model validates schema, defaults, types, and tag serialization.
 * 3. Validation schemas normalize input and reject malformed payloads.
 * 4. StudyResourceRepository performs CRUD, filtering, pagination, and relational lookups.
 * 5. Safe deletion and foreign key behavior (cascade on user, SET NULL on course/assignment/goal/session).
 * 6. StudyResourceService enforces strict student ownership, relational integrity, and isolated access.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_resources.db');
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
const { runMigrations, getMigrationStatus } = require('../migrations/migrationRunner');
const {
  StudyResource,
  studyResourceSchema,
  resourceTypeEnum,
  User,
  Course,
  Assignment,
  Goal,
  StudySession
} = require('../models');
const {
  studyResourceRepository,
  userRepository,
  courseRepository,
  assignmentRepository,
  goalRepository,
  studySessionRepository
} = require('../repositories');
const {
  createStudyResourceSchema,
  updateStudyResourceSchema,
  studyResourceFilterSchema
} = require('../validators');
const { studyResourceService } = require('../services/studyResourceService');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Study Resource Domain Verification');
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

  const db = getConnection();
  db.pragma('foreign_keys = ON');

  try {
    // -----------------------------------------------------------------
    // 1. Migration 009 Execution & Table / Index Verification
    // -----------------------------------------------------------------
    test('Migration 009: runs migrations and creates study_resources table', () => {
      initDb();
      runMigrations(db);

      const status = getMigrationStatus(db);
      assert.ok(status.applied.includes('009_student_study_resources'), 'Migration 009 must be in applied migrations list');

      // Verify table columns
      const cols = db.prepare('PRAGMA table_info(study_resources)').all();
      const colNames = cols.map(c => c.name);
      assert.ok(colNames.includes('id'));
      assert.ok(colNames.includes('user_id'));
      assert.ok(colNames.includes('course_id'));
      assert.ok(colNames.includes('assignment_id'));
      assert.ok(colNames.includes('goal_id'));
      assert.ok(colNames.includes('study_session_id'));
      assert.ok(colNames.includes('title'));
      assert.ok(colNames.includes('description'));
      assert.ok(colNames.includes('resource_type'));
      assert.ok(colNames.includes('url'));
      assert.ok(colNames.includes('content'));
      assert.ok(colNames.includes('file_name'));
      assert.ok(colNames.includes('file_size'));
      assert.ok(colNames.includes('mime_type'));
      assert.ok(colNames.includes('tags'));
      assert.ok(colNames.includes('is_favorite'));
      assert.ok(colNames.includes('archived'));
      assert.ok(colNames.includes('created_at'));
      assert.ok(colNames.includes('updated_at'));

      // Verify indexes
      const idxs = db.prepare('PRAGMA index_list(study_resources)').all();
      const idxNames = idxs.map(i => i.name);
      assert.ok(idxNames.includes('idx_study_resources_user_id'));
      assert.ok(idxNames.includes('idx_study_resources_user_type'));
      assert.ok(idxNames.includes('idx_study_resources_user_archived'));
      assert.ok(idxNames.includes('idx_study_resources_user_favorite'));
      assert.ok(idxNames.includes('idx_study_resources_course_id'));
      assert.ok(idxNames.includes('idx_study_resources_assignment_id'));
      assert.ok(idxNames.includes('idx_study_resources_goal_id'));
      assert.ok(idxNames.includes('idx_study_resources_study_session_id'));
      assert.ok(idxNames.includes('idx_study_resources_user_created'));
    });

    // -----------------------------------------------------------------
    // 2. StudyResource Domain Model Instantiation & Validation
    // -----------------------------------------------------------------
    test('Model: instantiates StudyResource with valid defaults and normalizations', () => {
      const res = StudyResource.create({
        user_id: 'usr-student-1',
        title: 'Distributed Consensus Paper Notes',
        tags: ['raft', 'consensus', 'exam']
      });

      assert.ok(res.id.startsWith('res-'));
      assert.strictEqual(res.user_id, 'usr-student-1');
      assert.strictEqual(res.title, 'Distributed Consensus Paper Notes');
      assert.strictEqual(res.resource_type, 'note');
      assert.strictEqual(res.is_favorite, 0);
      assert.strictEqual(res.archived, 0);
      assert.deepStrictEqual(res.tags, ['raft', 'consensus', 'exam']);
      assert.strictEqual(res.isFavorite(), false);
      assert.strictEqual(res.isArchived(), false);
      assert.strictEqual(res.hasTag('raft'), true);
      assert.strictEqual(res.hasTag('nonexistent'), false);

      const json = res.toJSON();
      assert.strictEqual(json.userId, 'usr-student-1');
      assert.strictEqual(json.isFavorite, false);
      assert.strictEqual(json.resourceType, 'note');

      const row = res.toRow();
      assert.strictEqual(typeof row.tags, 'string');
      assert.strictEqual(row.is_favorite, 0);
    });

    test('Model: supports link, reference, and document resource types', () => {
      const linkRes = StudyResource.create({
        user_id: 'usr-student-1',
        title: 'Raft Paper PDF',
        resource_type: 'link',
        url: 'https://raft.github.io/raft.pdf',
        description: 'In Search of an Understandable Consensus Algorithm'
      });
      assert.strictEqual(linkRes.resource_type, 'link');
      assert.strictEqual(linkRes.url, 'https://raft.github.io/raft.pdf');

      const docRes = StudyResource.create({
        user_id: 'usr-student-1',
        title: 'Lab 1 Architecture Diagram',
        resource_type: 'document',
        file_name: 'lab1_architecture.png',
        file_size: 1048576,
        mime_type: 'image/png'
      });
      assert.strictEqual(docRes.resource_type, 'document');
      assert.strictEqual(docRes.file_name, 'lab1_architecture.png');
      assert.strictEqual(docRes.file_size, 1048576);

      const refRes = StudyResource.create({
        user_id: 'usr-student-1',
        title: 'Operating Systems Concepts - Chapter 7',
        resource_type: 'reference',
        content: 'Deadlocks, Banker\'s Algorithm, and Resource Allocation Graphs'
      });
      assert.strictEqual(refRes.resource_type, 'reference');
      assert.ok(refRes.content.includes('Banker\'s Algorithm'));
    });

    test('Model: rejects empty title and invalid resource type', () => {
      assert.throws(() => {
        new StudyResource({
          id: 'res-invalid',
          user_id: 'usr-1',
          title: '',
          resource_type: 'note'
        });
      });

      assert.throws(() => {
        new StudyResource({
          id: 'res-invalid',
          user_id: 'usr-1',
          title: 'Valid Title',
          resource_type: 'unsupported_resource_type'
        });
      });
    });

    // -----------------------------------------------------------------
    // 3. Validation Schemas (create, update, filter)
    // -----------------------------------------------------------------
    test('Validators: createStudyResourceSchema validates and transforms camelCase', () => {
      const payload = {
        title: ' Lecture 4 Notes ',
        resourceType: 'note',
        content: '# Raft RPC protocol details',
        courseId: 'crs-101',
        assignmentId: 'asgn-201',
        goalId: 'goal-301',
        studySessionId: 'sess-401',
        favorite: true,
        tags: ['distributed', 'rpc']
      };

      const parsed = createStudyResourceSchema.parse(payload);
      assert.strictEqual(parsed.title, 'Lecture 4 Notes');
      assert.strictEqual(parsed.resource_type, 'note');
      assert.strictEqual(parsed.course_id, 'crs-101');
      assert.strictEqual(parsed.assignment_id, 'asgn-201');
      assert.strictEqual(parsed.goal_id, 'goal-301');
      assert.strictEqual(parsed.study_session_id, 'sess-401');
      assert.strictEqual(parsed.is_favorite, 1);
      assert.deepStrictEqual(parsed.tags, ['distributed', 'rpc']);
    });

    test('Validators: updateStudyResourceSchema allows partial updates', () => {
      const updates = {
        title: 'Updated Note Title',
        favorite: false
      };
      const parsed = updateStudyResourceSchema.parse(updates);
      assert.strictEqual(parsed.title, 'Updated Note Title');
      assert.strictEqual(parsed.is_favorite, 0);
      assert.strictEqual(parsed.course_id, undefined);
    });

    test('Validators: studyResourceFilterSchema normalizes query filters', () => {
      const filter = {
        type: 'link',
        courseId: 'crs-101',
        isFavorite: 'true',
        q: 'raft',
        sort: 'updated_at',
        order: 'ASC'
      };
      const parsed = studyResourceFilterSchema.parse(filter);
      assert.strictEqual(parsed.resource_type, 'link');
      assert.strictEqual(parsed.course_id, 'crs-101');
      assert.strictEqual(parsed.is_favorite, true);
      assert.strictEqual(parsed.searchTerm, 'raft');
      assert.strictEqual(parsed.sort, 'updated_at');
      assert.strictEqual(parsed.order, 'asc');
    });

    // -----------------------------------------------------------------
    // 4. Data Setup: Users & Relational Domain Entities
    // -----------------------------------------------------------------
    const testSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const userA = User.create({
      id: `usr-student-alpha-${testSuffix}`,
      email: `alpha_${testSuffix}@djsce.edu`,
      password: 'Password123!',
      full_name: 'Alpha Student',
      college_name: 'DJ Sanghvi'
    });
    userRepository.create(userA);

    const userB = User.create({
      id: `usr-student-beta-${testSuffix}`,
      email: `beta_${testSuffix}@djsce.edu`,
      password: 'Password123!',
      full_name: 'Beta Student',
      college_name: 'DJ Sanghvi'
    });
    userRepository.create(userB);

    const courseA = Course.create({
      id: `crs-ds-${testSuffix}`,
      user_id: userA.id,
      name: 'Distributed Systems',
      code: 'CS401'
    });
    courseRepository.create(courseA);

    const goalA = Goal.create({
      id: `goal-raft-${testSuffix}`,
      user_id: userA.id,
      course_id: courseA.id,
      title: 'Build Raft Consensus Engine'
    });
    goalRepository.create(goalA);

    const asgnA = Assignment.create({
      id: `asgn-lab1-${testSuffix}`,
      user_id: userA.id,
      course_id: courseA.id,
      goal_id: goalA.id,
      title: 'Raft Leader Election Lab',
      due_date: Date.now() + 86400000 * 7
    });
    assignmentRepository.create(asgnA);

    const sessionA = StudySession.create({
      id: `sess-paxos-${testSuffix}`,
      user_id: userA.id,
      course_id: courseA.id,
      assignment_id: asgnA.id,
      goal_id: goalA.id,
      title: 'Consensus Deep Dive',
      planned_start_time: Date.now() + 3600000,
      planned_duration_minutes: 60
    });
    studySessionRepository.create(sessionA);

    // -----------------------------------------------------------------
    // 5. Repository Layer CRUD & Relational Lookups
    // -----------------------------------------------------------------
    let createdResId;

    test('Repository: creates study resource with full associations', () => {
      const res = studyResourceRepository.create({
        user_id: userA.id,
        course_id: courseA.id,
        assignment_id: asgnA.id,
        goal_id: goalA.id,
        study_session_id: sessionA.id,
        title: 'Raft Paper Annotated Summary',
        description: 'Key insights from Ongaro & Ousterhout 2014',
        resource_type: 'note',
        content: '# Raft Overview\nState machine replication using leader election and log consensus.',
        url: 'https://raft.github.io/',
        tags: ['raft', 'consensus', 'paper'],
        is_favorite: 1
      });

      assert.ok(res && res.id);
      createdResId = res.id;
      assert.strictEqual(res.user_id, userA.id);
      assert.strictEqual(res.course_id, courseA.id);
      assert.strictEqual(res.assignment_id, asgnA.id);
      assert.strictEqual(res.goal_id, goalA.id);
      assert.strictEqual(res.study_session_id, sessionA.id);
      assert.strictEqual(res.is_favorite, 1);
      assert.strictEqual(res.resource_type, 'note');
    });

    test('Repository: findById and findByIdAndUserId retrieve stored resource', () => {
      const byId = studyResourceRepository.findById(createdResId);
      assert.ok(byId);
      assert.strictEqual(byId.title, 'Raft Paper Annotated Summary');

      const byUser = studyResourceRepository.findByIdAndUserId(createdResId, userA.id);
      assert.ok(byUser);
      assert.strictEqual(byUser.id, createdResId);

      // Foreign student cannot access
      const foreign = studyResourceRepository.findByIdAndUserId(createdResId, userB.id);
      assert.strictEqual(foreign, null);
    });

    test('Repository: findByCourse, findByAssignment, findByGoal, findByStudySession', () => {
      const byCourse = studyResourceRepository.findByCourse(courseA.id, userA.id);
      assert.strictEqual(byCourse.length, 1);
      assert.strictEqual(byCourse[0].id, createdResId);

      const byAsgn = studyResourceRepository.findByAssignment(asgnA.id, userA.id);
      assert.strictEqual(byAsgn.length, 1);
      assert.strictEqual(byAsgn[0].id, createdResId);

      const byGoal = studyResourceRepository.findByGoal(goalA.id, userA.id);
      assert.strictEqual(byGoal.length, 1);
      assert.strictEqual(byGoal[0].id, createdResId);

      const bySession = studyResourceRepository.findByStudySession(sessionA.id, userA.id);
      assert.strictEqual(bySession.length, 1);
      assert.strictEqual(bySession[0].id, createdResId);

      // Student B sees none of Student A's associated resources
      assert.strictEqual(studyResourceRepository.findByCourse(courseA.id, userB.id).length, 0);
    });

    test('Repository: pagination and filter lookups', () => {
      // Create a second resource (link)
      const res2 = studyResourceRepository.create({
        user_id: userA.id,
        course_id: courseA.id,
        title: 'Visual Raft Simulator',
        resource_type: 'link',
        url: 'http://thesecretlivesofdata.com/raft/',
        tags: ['simulation', 'interactive']
      });

      const paged = studyResourceRepository.findWithPaginationAndFilters(userA.id, {
        page: 1,
        limit: 10
      });
      assert.strictEqual(paged.total, 2);
      assert.strictEqual(paged.data.length, 2);

      // Filter by resource_type: link
      const linksOnly = studyResourceRepository.findWithPaginationAndFilters(userA.id, {
        resource_type: 'link'
      });
      assert.strictEqual(linksOnly.total, 1);
      assert.strictEqual(linksOnly.data[0].id, res2.id);

      // Filter by tag
      const tagFiltered = studyResourceRepository.findWithPaginationAndFilters(userA.id, {
        tag: 'simulation'
      });
      assert.strictEqual(tagFiltered.total, 1);
      assert.strictEqual(tagFiltered.data[0].id, res2.id);

      // Search term
      const searchFiltered = studyResourceRepository.findWithPaginationAndFilters(userA.id, {
        searchTerm: 'Visual'
      });
      assert.strictEqual(searchFiltered.total, 1);
      assert.strictEqual(searchFiltered.data[0].id, res2.id);
    });

    test('Repository: toggleFavorite, archive, and unarchive', () => {
      const favToggled = studyResourceRepository.toggleFavorite(createdResId, userA.id);
      assert.strictEqual(favToggled.is_favorite, 0);

      const favBack = studyResourceRepository.toggleFavorite(createdResId, userA.id);
      assert.strictEqual(favBack.is_favorite, 1);

      const archived = studyResourceRepository.archive(createdResId, userA.id);
      assert.strictEqual(archived.archived, 1);

      const unarchived = studyResourceRepository.unarchive(createdResId, userA.id);
      assert.strictEqual(unarchived.archived, 0);
    });

    // -----------------------------------------------------------------
    // 6. Service Layer: Ownership Isolation & Validation
    // -----------------------------------------------------------------
    test('Service: creates resource with validated student ownership', () => {
      const created = studyResourceService.createResource(userA.id, {
        title: 'Service Created Resource',
        resource_type: 'note',
        content: 'Created via studyResourceService',
        course_id: courseA.id,
        assignment_id: asgnA.id
      });
      assert.ok(created && created.id);
      assert.strictEqual(created.user_id, userA.id);
    });

    test('Service: rejects linking to another student\'s course (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(userB.id, {
          title: 'Illicit Course Resource',
          course_id: courseA.id // courseA belongs to userA!
        });
      }, err => err instanceof ForbiddenError);
    });

    test('Service: rejects linking to another student\'s assignment (ForbiddenError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(userB.id, {
          title: 'Illicit Assignment Resource',
          assignment_id: asgnA.id // asgnA belongs to userA!
        });
      }, err => err instanceof ForbiddenError);
    });

    test('Service: rejects linking to non-existent entity (NotFoundError)', () => {
      assert.throws(() => {
        studyResourceService.createResource(userA.id, {
          title: 'Phantom Resource',
          course_id: 'non-existent-course-999'
        });
      }, err => err instanceof NotFoundError);
    });

    test('Service: getResourceById enforces student ownership', () => {
      // userA can access
      const resource = studyResourceService.getResourceById(createdResId, userA.id);
      assert.strictEqual(resource.id, createdResId);

      // userB is forbidden
      assert.throws(() => {
        studyResourceService.getResourceById(createdResId, userB.id);
      }, err => err instanceof ForbiddenError);

      // Non-existent throws NotFoundError
      assert.throws(() => {
        studyResourceService.getResourceById('res-phantom-id', userA.id);
      }, err => err instanceof NotFoundError);
    });

    test('Service: updateResource and deleteResource protect ownership', () => {
      // userB cannot update userA resource
      assert.throws(() => {
        studyResourceService.updateResource(createdResId, userB.id, { title: 'Hacked Title' });
      }, err => err instanceof ForbiddenError);

      // userB cannot delete userA resource
      assert.throws(() => {
        studyResourceService.deleteResource(createdResId, userB.id);
      }, err => err instanceof ForbiddenError);

      // userA can update successfully
      const updated = studyResourceService.updateResource(createdResId, userA.id, {
        title: 'Masterfully Annotated Raft Paper'
      });
      assert.strictEqual(updated.title, 'Masterfully Annotated Raft Paper');
    });

    // -----------------------------------------------------------------
    // 7. Safe Deletion & Cascade Constraints (SQLite Foreign Keys)
    // -----------------------------------------------------------------
    test('Constraints: deleting associated course sets course_id to NULL without deleting resource', () => {
      const tempCourse = Course.create({
        id: 'crs-temp-to-delete',
        user_id: userA.id,
        name: 'Temporary Course'
      });
      courseRepository.create(tempCourse);

      const linkedRes = studyResourceRepository.create({
        user_id: userA.id,
        course_id: tempCourse.id,
        title: 'Resource Linked to Temporary Course'
      });
      assert.strictEqual(linkedRes.course_id, tempCourse.id);

      // Delete the course
      courseRepository.delete(tempCourse.id);

      // Resource must still exist, with course_id set to NULL
      const afterDelete = studyResourceRepository.findById(linkedRes.id);
      assert.ok(afterDelete, 'Resource should survive course deletion');
      assert.strictEqual(afterDelete.course_id, null, 'course_id must be set to NULL via ON DELETE SET NULL');

      // Cleanup
      studyResourceRepository.delete(linkedRes.id, userA.id);
    });

    test('Constraints: deleting owning student cascades and removes their study resources', () => {
      const tempUser = User.create({
        id: `usr-temp-${testSuffix}`,
        email: `temp_${testSuffix}@djsce.edu`,
        password: 'Password123!',
        full_name: 'Temp Student',
        college_name: 'DJ Sanghvi'
      });
      userRepository.create(tempUser);

      const tempRes = studyResourceRepository.create({
        user_id: tempUser.id,
        title: 'Resource Bound to Temporary Student'
      });
      assert.ok(studyResourceRepository.findById(tempRes.id));

      // Delete the user
      db.prepare('DELETE FROM users WHERE id = ?').run(tempUser.id);

      // Study resource should be cascade deleted
      const afterUserDelete = studyResourceRepository.findById(tempRes.id);
      assert.strictEqual(afterUserDelete, null, 'Resource must be cascade deleted when user is deleted');
    });

    console.log('\n----------------------------------------------------');
    console.log(` STUDY RESOURCES DOMAIN SUMMARY: ${passed} passed, ${failed} failed`);
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
