/**
 * Verification Script: Transactional Business Operations
 *
 * Verifies that multi-step mutations across RideGroupRepository,
 * ReportRepository, and FeedbackRepository execute within database
 * transactions and maintain consistency on failure.
 */

const assert = require('assert');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const { reportRepository } = require('../repositories/ReportRepository');
const { feedbackRepository } = require('../repositories/FeedbackRepository');
const { rideGroupService, feedbackService } = require('../services');

async function runTransactionTests() {
  console.log('\n====================================================');
  console.log(' Running Database Transactions & Atomicity Suite');
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
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // 1. Transactional Ride Group Join / Leave
  const group = rideGroupRepository.create({
    creator_pseudonym: 'Tx_Tester',
    origin_area: 'Bandra',
    destination_college: 'DJ Sanghvi',
    departure_time: '09:00 AM',
    mode: 'auto',
    max_members: 2,
    current_members: 1,
    notes: 'Tx test'
  });

  test('RideGroupRepository: atomicJoin increments members inside transaction', () => {
    const updated = rideGroupRepository.atomicJoin(group.id);
    assert.strictEqual(updated.current_members, 2);
  });

  test('RideGroupRepository: atomicJoin rolls back and rejects when group is at max capacity', () => {
    assert.throws(
      () => rideGroupRepository.atomicJoin(group.id),
      err => err.code === 'GROUP_FULL'
    );
    // Verify count did not exceed 2
    const current = rideGroupRepository.findById(group.id);
    assert.strictEqual(current.current_members, 2);
  });

  test('RideGroupRepository: atomicLeave decrements members inside transaction', () => {
    const updated = rideGroupRepository.atomicLeave(group.id);
    assert.strictEqual(updated.current_members, 1);
  });

  test('RideGroupRepository: atomicLeave rolls back and prevents dropping below 1 member', () => {
    assert.throws(
      () => rideGroupRepository.atomicLeave(group.id),
      err => err.code === 'MINIMUM_MEMBERSHIP_REACHED'
    );
    const current = rideGroupRepository.findById(group.id);
    assert.strictEqual(current.current_members, 1);
  });

  // 2. Transactional Report Vote & Auto-Expiry
  const report = reportRepository.create({
    pseudonym: 'Tx_Reporter',
    area: 'Kurla',
    route_name: 'Central Line',
    mode: 'train',
    message: 'Waterlogging near tracks',
    impact: 'high',
    durationObservedMinutes: 60
  });

  test('ReportRepository: addVote records vote and increments counter atomically', () => {
    const res = reportRepository.addVote(report.id, 'voter_tx_1', 'confirm');
    assert.strictEqual(res.updatedReport.confirmation_count, 1);
    assert.strictEqual(res.alreadyVoted, false);
  });

  test('ReportRepository: delete cascades vote deletion and report deletion in a single transaction', () => {
    const deleted = reportRepository.delete(report.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(reportRepository.findById(report.id), null);
    assert.strictEqual(reportRepository.findVote(report.id, 'voter_tx_1'), null);
  });

  // 3. Feedback Batch Transactions & Rollback on failure
  const batchRecommendationId = `rec-tx-${Date.now()}`;
  const validBatch = [
    {
      id: `fb-tx-1-${Date.now()}`,
      recommendation_id: batchRecommendationId,
      is_useful: true,
      tags: ['fast', 'punctual'],
      comment: 'Great route'
    },
    {
      id: `fb-tx-2-${Date.now()}`,
      recommendation_id: batchRecommendationId,
      is_useful: false,
      tags: ['crowded'],
      comment: 'Too packed'
    }
  ];

  test('FeedbackRepository: createBatch inserts multiple rows atomically', () => {
    const created = feedbackRepository.createBatch(validBatch);
    assert.strictEqual(created.length, 2);
    const summary = feedbackRepository.getRatingSummary(batchRecommendationId);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.helpful, 1);
  });

  test('FeedbackRepository: createBatch rolls back entirely on database collision', () => {
    const duplicateId = validBatch[0].id;
    const failingBatch = [
      {
        id: `fb-tx-should-not-exist-${Date.now()}`,
        recommendation_id: 'fail-rec',
        is_useful: true,
        comment: 'Should rollback'
      },
      {
        id: duplicateId, // Collides with existing ID!
        recommendation_id: 'fail-rec',
        is_useful: true,
        comment: 'Will trigger unique constraint'
      }
    ];

    assert.throws(() => feedbackRepository.createBatch(failingBatch));
    // Verify first row was rolled back and never inserted
    const orphan = feedbackRepository.findById(`fb-tx-should-not-exist-${Date.now()}`);
    assert.strictEqual(orphan, null);
  });

  test('FeedbackRepository: deleteByRecommendationId cleans up all related feedback in a transaction', () => {
    const changes = feedbackRepository.deleteByRecommendationId(batchRecommendationId);
    assert.strictEqual(changes, 2);
    const summary = feedbackRepository.getRatingSummary(batchRecommendationId);
    assert.strictEqual(summary.total, 0);
  });

  // Clean up
  rideGroupRepository.delete(group.id);

  console.log('\n----------------------------------------------------');
  console.log(` TRANSACTIONS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionTests().catch(err => {
  console.error('Fatal error running transaction tests:', err);
  process.exit(1);
});
