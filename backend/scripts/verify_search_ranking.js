/**
 * Search Ranking & Deterministic Ordering Verification Suite
 *
 * Validates the quality, precision, and determinism of the student search ranking strategy:
 * 1. Exact matches rank above partial / substring matches.
 * 2. Beginning-of-field matches rank above later / interior matches.
 * 3. Title / name matches rank above lower-priority descriptive fields (notes, description).
 * 4. Closer textual matches (higher coverage density) rank above weaker / sprawling matches.
 * 5. Multi-token queries prioritize items with all terms clustered in the title.
 * 6. Secondary identifiers (course codes, locations) provide strong deterministic signals.
 * 7. Active status provides a sensible boost over terminal/archived states.
 * 8. Deterministic 5-tier secondary sorting guarantees identical ordering regardless of initial array permutation.
 * 9. Integration with StudentSearchService respects ranking contracts with zero data leakage.
 */

const assert = require('assert/strict');
const path = require('path');
const {
  RANKING_WEIGHTS,
  calculateCoverageBonus,
  calculateRelevanceScore,
  compareRankedItems,
  rankSearchResults,
  compileQueryPatterns
} = require('../services/searchRanker');
const { studentSearchService } = require('../services/studentSearchService');
const { db } = require('../db/database');

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
  console.log(' Running Deterministic Search Ranking Test Suite');
  console.log('====================================================\n');

  // -----------------------------------------------------------------
  // 1. Exact Matches Rank Above Partial Matches
  // -----------------------------------------------------------------
  await test('Exact Match: exact title match scores higher than prefix, word-boundary, and substring matches', () => {
    const query = 'Operating Systems';

    const exactItem = {
      id: 'item-1',
      type: 'course',
      title: 'Operating Systems',
      subtitle: 'CS301',
      description: 'Core OS concepts',
      status: 'active'
    };

    const prefixItem = {
      id: 'item-2',
      type: 'course',
      title: 'Operating Systems Lab',
      subtitle: 'CS301L',
      description: 'Hands-on OS programming',
      status: 'active'
    };

    const interiorWordItem = {
      id: 'item-3',
      type: 'course',
      title: 'Advanced Operating Systems',
      subtitle: 'CS401',
      description: 'Distributed kernels and microkernels',
      status: 'active'
    };

    const substringItem = {
      id: 'item-4',
      type: 'course',
      title: 'Intro to Micro-Operating Systems Design',
      subtitle: 'CS501',
      description: 'Embedded kernels',
      status: 'active'
    };

    const scoreExact = calculateRelevanceScore(exactItem, query);
    const scorePrefix = calculateRelevanceScore(prefixItem, query);
    const scoreWord = calculateRelevanceScore(interiorWordItem, query);
    const scoreSub = calculateRelevanceScore(substringItem, query);

    assert.ok(scoreExact > scorePrefix, `Exact (${scoreExact}) must score higher than Prefix (${scorePrefix})`);
    assert.ok(scorePrefix > scoreWord, `Prefix (${scorePrefix}) must score higher than Interior Word (${scoreWord})`);
    assert.ok(scoreWord > scoreSub, `Interior Word (${scoreWord}) must score higher than Substring (${scoreSub})`);

    const ranked = rankSearchResults([substringItem, prefixItem, exactItem, interiorWordItem], query);
    assert.strictEqual(ranked[0].id, 'item-1', 'Exact match must be ranked #1');
    assert.strictEqual(ranked[1].id, 'item-2', 'Prefix match must be ranked #2');
    assert.strictEqual(ranked[2].id, 'item-3', 'Interior word match must be ranked #3');
    assert.strictEqual(ranked[3].id, 'item-4', 'Substring match must be ranked #4');
  });

  // -----------------------------------------------------------------
  // 2. Beginning-of-Field Matches Rank Above Later Matches
  // -----------------------------------------------------------------
  await test('Prefix vs Later: beginning-of-field matches rank above later matches in the same field', () => {
    const query = 'Database';

    const beginsWithItem = {
      id: 'db-prefix',
      type: 'course',
      title: 'Database Management Systems',
      status: 'active'
    };

    const laterInTitleItem = {
      id: 'db-later',
      type: 'course',
      title: 'Principles of Database Implementation',
      status: 'active'
    };

    const scoreBegins = calculateRelevanceScore(beginsWithItem, query);
    const scoreLater = calculateRelevanceScore(laterInTitleItem, query);

    assert.ok(
      scoreBegins > scoreLater,
      `Begins-with score (${scoreBegins}) must exceed later-in-field score (${scoreLater})`
    );

    const ranked = rankSearchResults([laterInTitleItem, beginsWithItem], query);
    assert.strictEqual(ranked[0].id, 'db-prefix');
    assert.strictEqual(ranked[1].id, 'db-later');
  });

  // -----------------------------------------------------------------
  // 3. Title/Name Matches Rank Above Lower-Priority Descriptive Fields
  // -----------------------------------------------------------------
  await test('Field Hierarchy: title match ranks strictly above description / notes match', () => {
    const query = 'Machine Learning';

    const titleMatch = {
      id: 'title-match',
      type: 'course',
      title: 'Machine Learning Fundamentals',
      description: 'Comprehensive study of statistical inference',
      status: 'active'
    };

    const descMatch = {
      id: 'desc-match',
      type: 'assignment',
      title: 'Problem Set 4: Gradient Descent',
      description: 'Applied machine learning assignment for classification',
      status: 'active'
    };

    const scoreTitle = calculateRelevanceScore(titleMatch, query);
    const scoreDesc = calculateRelevanceScore(descMatch, query);

    assert.ok(
      scoreTitle > scoreDesc,
      `Title match (${scoreTitle}) must outrank description match (${scoreDesc})`
    );

    const ranked = rankSearchResults([descMatch, titleMatch], query);
    assert.strictEqual(ranked[0].id, 'title-match');
    assert.strictEqual(ranked[1].id, 'desc-match');
  });

  // -----------------------------------------------------------------
  // 4. Closer Textual Matches (Coverage Density) Rank Above Weaker Matches
  // -----------------------------------------------------------------
  await test('Textual Coverage: compact matching titles outscore long, sprawling titles', () => {
    const query = 'Raft';

    const compactItem = {
      id: 'compact',
      type: 'study_session',
      title: 'Raft',
      status: 'active'
    };

    const mediumItem = {
      id: 'medium',
      type: 'study_session',
      title: 'Raft Paper Discussion',
      status: 'active'
    };

    const sprawlingItem = {
      id: 'sprawling',
      type: 'study_session',
      title: 'Comprehensive Overview and Comparison of Distributed Consensus Algorithms with Special Focus on Raft Implementation',
      status: 'active'
    };

    const scoreCompact = calculateRelevanceScore(compactItem, query);
    const scoreMedium = calculateRelevanceScore(mediumItem, query);
    const scoreSprawl = calculateRelevanceScore(sprawlingItem, query);

    assert.ok(scoreCompact > scoreMedium, `Compact (${scoreCompact}) must exceed Medium (${scoreMedium})`);
    assert.ok(scoreMedium > scoreSprawl, `Medium (${scoreMedium}) must exceed Sprawling (${scoreSprawl})`);

    const ranked = rankSearchResults([sprawlingItem, compactItem, mediumItem], query);
    assert.strictEqual(ranked[0].id, 'compact');
    assert.strictEqual(ranked[1].id, 'medium');
    assert.strictEqual(ranked[2].id, 'sprawling');
  });

  // -----------------------------------------------------------------
  // 5. Multi-Token Queries & Query Cohesion
  // -----------------------------------------------------------------
  await test('Multi-Token Cohesion: all terms in title score higher than scattered terms', () => {
    const query = 'distributed algorithms exam';

    const allInTitle = {
      id: 'all-title',
      type: 'calendar_event',
      title: 'Distributed Algorithms Final Exam',
      description: 'Midterm paper in Hall 3',
      status: 'active'
    };

    const scatteredTerms = {
      id: 'scattered',
      type: 'assignment',
      title: 'Midterm Exam Preparation',
      description: 'Review distributed consensus and classic algorithms chapter 4',
      status: 'active'
    };

    const scoreTitle = calculateRelevanceScore(allInTitle, query);
    const scoreScattered = calculateRelevanceScore(scatteredTerms, query);

    assert.ok(
      scoreTitle > scoreScattered,
      `All tokens in title (${scoreTitle}) must outscore scattered tokens (${scoreScattered})`
    );

    const ranked = rankSearchResults([scatteredTerms, allInTitle], query);
    assert.strictEqual(ranked[0].id, 'all-title');
  });

  // -----------------------------------------------------------------
  // 6. Secondary Identifier Priority (Course Codes, Locations)
  // -----------------------------------------------------------------
  await test('Identifiers: exact course code match provides strong deterministic score', () => {
    const query = 'CS401';

    const codeMatch = {
      id: 'course-code',
      type: 'course',
      title: 'Advanced Computer Networks',
      metadata: { courseCode: 'CS401' },
      status: 'active'
    };

    const descMention = {
      id: 'desc-mention',
      type: 'assignment',
      title: 'Packet Analysis Lab',
      description: 'Pre-requisite knowledge recommended from CS401 lecture',
      status: 'active'
    };

    const scoreCode = calculateRelevanceScore(codeMatch, query);
    const scoreDesc = calculateRelevanceScore(descMention, query);

    assert.ok(scoreCode > scoreDesc, `Code match (${scoreCode}) must exceed description mention (${scoreDesc})`);
  });

  // -----------------------------------------------------------------
  // 7. Status Modifier Boost
  // -----------------------------------------------------------------
  await test('Status Boost: active/pending deliverables rank above completed/cancelled ones', () => {
    const query = 'Compiler Assignment';

    const activeItem = {
      id: 'active-asgn',
      type: 'assignment',
      title: 'Compiler Assignment',
      status: 'pending'
    };

    const completedItem = {
      id: 'completed-asgn',
      type: 'assignment',
      title: 'Compiler Assignment',
      status: 'completed'
    };

    const scoreActive = calculateRelevanceScore(activeItem, query);
    const scoreCompleted = calculateRelevanceScore(completedItem, query);

    assert.ok(
      scoreActive > scoreCompleted,
      `Active status (${scoreActive}) must score higher than completed status (${scoreCompleted})`
    );
  });

  // -----------------------------------------------------------------
  // 8. Deterministic 5-Tier Tiebreaker & Invariant Sorting
  // -----------------------------------------------------------------
  await test('Determinism: secondary sorting produces invariant order across 50 random shuffles', () => {
    const query = 'Study Group';

    const items = [
      { id: 'item-d', type: 'saved_route', title: 'Study Group Route', createdAt: 1000, updatedAt: 1000, status: 'saved' },
      { id: 'item-a', type: 'calendar_event', title: 'Study Group Meeting', createdAt: 2000, updatedAt: 2000, status: 'scheduled' },
      { id: 'item-b', type: 'calendar_event', title: 'Study Group Meeting', createdAt: 2000, updatedAt: 2000, status: 'scheduled' },
      { id: 'item-c', type: 'study_session', title: 'Study Group Session', createdAt: 1500, updatedAt: 1500, status: 'scheduled' }
    ];

    // Compute expected reference order
    const referenceOrder = rankSearchResults([...items], query).map(x => x.id);

    // Shuffle and verify 50 times
    for (let iteration = 0; iteration < 50; iteration++) {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      const sorted = rankSearchResults(shuffled, query).map(x => x.id);
      assert.deepStrictEqual(
        sorted,
        referenceOrder,
        `Sort order must be 100% deterministic on iteration ${iteration}`
      );
    }
  });

  // -----------------------------------------------------------------
  // 9. Integration with StudentSearchService
  // -----------------------------------------------------------------
  await test('Service Integration: StudentSearchService orders cross-domain entities by relevance score', () => {
    const timestamp = Date.now();
    const student = {
      id: `usr-rank-${timestamp}`,
      email: `rank_${timestamp}@djsce.edu`,
      password_hash: 'hash',
      name: 'Ranking Student',
      role: 'student',
      created_at: timestamp,
      updated_at: timestamp
    };

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(student.id, student.email, student.password_hash, student.name, 'DJ Sanghvi', student.role, student.created_at, student.updated_at);

    // 1. Exact title course: "Parallel Computing"
    const courseId = `course-rank-${timestamp}`;
    db.prepare(`
      INSERT INTO courses (id, user_id, name, code, instructor, color, credits, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, student.id, 'Parallel Computing', 'CS601', 'Dr. Kumar', '#10B981', 4, 0, timestamp, timestamp);

    // 2. Assignment with interior mention: "Lab 3: Introduction to Parallel Computing"
    const asgnId = `asgn-rank-${timestamp}`;
    db.prepare(`
      INSERT INTO assignments (id, user_id, course_id, title, description, due_date, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(asgnId, student.id, courseId, 'Lab 3: Introduction to Parallel Computing', 'GPU kernels', timestamp + 86400000, 'pending', 'medium', timestamp, timestamp);

    // 3. Goal with descriptive mention only: "Complete Semester Project" (description mentions parallel computing)
    const goalId = `goal-rank-${timestamp}`;
    db.prepare(`
      INSERT INTO goals (id, user_id, course_id, title, description, target_date, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(goalId, student.id, courseId, 'Complete Semester Project', 'Build parallel computing cluster using MPI', '2026-11-30', 'in_progress', 20, timestamp, timestamp);

    const searchResponse = studentSearchService.search(student.id, student, { query: 'Parallel Computing' });

    assert.ok(searchResponse.results.length >= 3, 'All 3 items must be returned');

    // Item 1 must be exact match course
    assert.strictEqual(searchResponse.results[0].id, courseId, 'Exact course title match must rank #1');
    assert.strictEqual(searchResponse.results[0].type, 'course');

    // Item 2 must be assignment with title mention
    assert.strictEqual(searchResponse.results[1].id, asgnId, 'Assignment title mention must rank #2');
    assert.strictEqual(searchResponse.results[1].type, 'assignment');

    // Item 3 must be goal with description mention
    assert.strictEqual(searchResponse.results[2].id, goalId, 'Goal description mention must rank #3');
    assert.strictEqual(searchResponse.results[2].type, 'goal');

    // Scores must be strictly descending or equal
    for (let i = 0; i < searchResponse.results.length - 1; i++) {
      assert.ok(
        searchResponse.results[i].relevanceScore >= searchResponse.results[i + 1].relevanceScore,
        `Result ${i} score (${searchResponse.results[i].relevanceScore}) must be >= Result ${i + 1} score (${searchResponse.results[i + 1].relevanceScore})`
      );
    }
  });

  console.log('\n----------------------------------------------------');
  console.log(` SEARCH RANKING VERIFICATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('----------------------------------------------------');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal ranking verification error:', err);
  process.exit(1);
});
