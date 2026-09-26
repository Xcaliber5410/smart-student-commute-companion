/**
 * Verification Script: Domain Business Rules
 *
 * Verifies core business rules across RideGroupService, ReportService, and AuthService:
 * - State and capacity bounds
 * - Membership rules and solo-leave prevention
 * - Ownership assertions at the service layer
 * - Voting eligibility on active vs inactive/expired reports
 * - Resolved report modification rules
 */

const assert = require('assert');
const { rideGroupService, reportService, authService } = require('../services');
const { BadRequestError, ForbiddenError, ConflictError } = require('../errors');

async function runBusinessRuleTests() {
  console.log('\n====================================================');
  console.log(' Running Domain Business Rules Verification Suite');
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

  // --- RIDE GROUP BUSINESS RULES ---
  const createdGroup = rideGroupService.createRideGroup({
    creator_pseudonym: 'Rohan_Tester',
    origin_area: 'Andheri West',
    destination_college: 'D.J. Sanghvi',
    departure_time: '08:30 AM',
    mode: 'auto',
    max_members: 2,
    current_members: 1,
    notes: 'Morning rush'
  });

  test('RideGroupService: Creator cannot join their own group as an additional member', () => {
    assert.throws(
      () => rideGroupService.joinRideGroup(createdGroup.id, 'Rohan_Tester'),
      err => err instanceof BadRequestError && err.code === 'CREATOR_ALREADY_MEMBER'
    );
  });

  test('RideGroupService: Student can join available group up to max_members', () => {
    const joined = rideGroupService.joinRideGroup(createdGroup.id, 'Ananya_Student');
    assert.strictEqual(joined.current_members, 2);
  });

  test('RideGroupService: Group at max capacity rejects additional joiners', () => {
    assert.throws(
      () => rideGroupService.joinRideGroup(createdGroup.id, 'Third_Student'),
      err => err instanceof BadRequestError && err.code === 'GROUP_FULL'
    );
  });

  test('RideGroupService: Cannot reduce max_members below current_members', () => {
    assert.throws(
      () => rideGroupService.updateRideGroup(createdGroup.id, { max_members: 1 }),
      err => err instanceof BadRequestError && err.code === 'INVALID_CAPACITY'
    );
  });

  test('RideGroupService: Student can leave group when members > 1', () => {
    const left = rideGroupService.leaveRideGroup(createdGroup.id);
    assert.strictEqual(left.current_members, 1);
  });

  test('RideGroupService: Solo member cannot leave ride group', () => {
    assert.throws(
      () => rideGroupService.leaveRideGroup(createdGroup.id),
      err => err instanceof BadRequestError && err.code === 'MINIMUM_MEMBERSHIP_REACHED'
    );
  });

  test('RideGroupService: Non-creator non-admin is forbidden from updating group', () => {
    const imposter = { id: 'usr-999', full_name: 'Imposter_User', role: 'student' };
    assert.throws(
      () => rideGroupService.updateRideGroup(createdGroup.id, { notes: 'Hijacked' }, imposter),
      err => err instanceof ForbiddenError
    );
  });

  test('RideGroupService: Creator is permitted to update own group', () => {
    const creatorUser = { id: 'usr-1', full_name: 'Rohan_Tester', role: 'student' };
    const updated = rideGroupService.updateRideGroup(createdGroup.id, { notes: 'Updated by owner' }, creatorUser);
    assert.strictEqual(updated.notes, 'Updated by owner');
  });

  // --- REPORT BUSINESS RULES ---
  const activeReport = reportService.createReport({
    pseudonym: 'Reporter_Student',
    area: 'Dadar Station',
    route_name: 'Western Line',
    mode: 'train',
    message: 'Signal failure causing 15m delay',
    impact: 'medium',
    durationObservedMinutes: 60
  });

  test('ReportService: Can vote on active non-expired disruption report', () => {
    const voteRes = reportService.confirmReport(activeReport.id, 'student_voter_1');
    assert.strictEqual(voteRes.alreadyVoted, false);
    assert.strictEqual(voteRes.updatedReport.confirmation_count, 2);
  });

  test('ReportService: Duplicate vote from same userToken is detected', () => {
    const voteRes = reportService.confirmReport(activeReport.id, 'student_voter_1');
    assert.strictEqual(voteRes.alreadyVoted, true);
  });

  test('ReportService: Disallows voting on resolved disruption reports', () => {
    reportService.updateReport(activeReport.id, { status: 'resolved' });
    assert.throws(
      () => reportService.confirmReport(activeReport.id, 'student_voter_2'),
      err => err instanceof BadRequestError && err.code === 'REPORT_INACTIVE'
    );
  });

  test('ReportService: Cannot modify resolved report without reactivating', () => {
    assert.throws(
      () => reportService.updateReport(activeReport.id, { message: 'Attempted edit' }),
      err => err instanceof BadRequestError && err.code === 'REPORT_RESOLVED'
    );
  });

  test('ReportService: Non-creator non-admin is forbidden from deleting report', () => {
    const imposter = { id: 'usr-999', full_name: 'Imposter_User', role: 'student' };
    assert.throws(
      () => reportService.deleteReport(activeReport.id, imposter),
      err => err instanceof ForbiddenError
    );
  });

  // Clean up
  rideGroupService.deleteRideGroup(createdGroup.id);
  reportService.deleteReport(activeReport.id);

  console.log('\n----------------------------------------------------');
  console.log(` BUSINESS RULES SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBusinessRuleTests().catch(err => {
  console.error('Fatal error running business rule tests:', err);
  process.exit(1);
});
