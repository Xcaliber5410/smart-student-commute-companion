/**
 * Verification Script: Student Commute Preferences Domain (P9)
 *
 * Exhaustively tests the student commute preferences domain layer:
 *
 * 1. Sensible Defaults
 * 2. Valid Preferences & Attribute Mapping
 * 3. Invalid Transport Modes Rejection
 * 4. Invalid Constraint Values Rejection
 * 5. Ownership & Access Control (Student vs Imposter vs Admin)
 * 6. Privacy Boundaries (Zero GPS telemetry, flat numbers, or street addresses)
 * 7. Pipeline Integration & CommuteConstraint Bridging
 * 8. Persistence Round-Trip & Reset to Defaults
 */

const assert = require('assert');
const {
  StudentCommutePreference,
  studentCommutePreferenceSchema,
  CommuteConstraint,
  TRANSPORT_MODES
} = require('../models');
const {
  studentCommutePreferenceRepository,
  userRepository
} = require('../repositories');
const {
  studentCommutePreferenceService,
  commuteContextService,
  authService
} = require('../services');
const {
  validateCommutePreferences
} = require('../validators');
const {
  ForbiddenError,
  NotFoundError,
  BadRequestError
} = require('../errors');

async function runCommutePreferenceTests() {
  console.log('\n========================================================');
  console.log(' Running Student Commute Preferences Verification Suite');
  console.log('========================================================\n');

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

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Provision test users
  const timestamp = Date.now();
  const student = authService.register({
    email: `student-pref-${timestamp}@djsce.edu`,
    password: 'SafePassword123!',
    full_name: 'Aarav Patel',
    college_name: 'D.J. Sanghvi College of Engineering'
  });

  const imposter = authService.register({
    email: `imposter-pref-${timestamp}@other.edu`,
    password: 'SafePassword123!',
    full_name: 'Imposter User',
    college_name: 'Other University'
  });

  const admin = authService.register({
    email: `admin-pref-${timestamp}@admin.djsce.edu`,
    password: 'SafePassword123!',
    full_name: 'Admin Moderator',
    college_name: 'D.J. Sanghvi',
    role: 'admin'
  });

  // ==========================================================================
  // SUITE 1: SENSIBLE DEFAULTS
  // ==========================================================================
  test('Sensible Defaults: Initial preferences provide realistic commute defaults', () => {
    const defaultPref = StudentCommutePreference.createDefault(student.id);

    assert.strictEqual(defaultPref.user_id, student.id);
    assert.strictEqual(defaultPref.walking_tolerance_minutes, 20);
    assert.strictEqual(defaultPref.max_transfers, 3);
    assert.strictEqual(defaultPref.max_budget_rupees, 100);
    assert.strictEqual(defaultPref.route_preference, 'balanced');
    assert.strictEqual(defaultPref.default_arrival_time, '09:00');
    assert.strictEqual(defaultPref.allow_shared_rides, true);
    assert.strictEqual(defaultPref.require_wheelchair_access, false);
    assert.deepStrictEqual(defaultPref.preferred_modes, [
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.WALK
    ]);
  });

  // ==========================================================================
  // SUITE 2: VALID PREFERENCES & ATTRIBUTE MAPPING
  // ==========================================================================
  test('Valid Preferences: Model validates and allows helper queries', () => {
    const customPref = new StudentCommutePreference({
      user_id: student.id,
      preferred_modes: ['metro', 'walk'],
      walking_tolerance_minutes: 15,
      max_transfers: 1,
      max_budget_rupees: 80,
      route_preference: 'fastest',
      default_arrival_time: '08:45',
      allow_shared_rides: false,
      require_wheelchair_access: true,
      default_origin_area: 'Andheri West',
      default_destination_college: 'D.J. Sanghvi College of Engineering'
    });

    assert.strictEqual(customPref.allowsMode('metro'), true);
    assert.strictEqual(customPref.allowsMode('train'), false);
    assert.strictEqual(customPref.isWithinBudget(50), true);
    assert.strictEqual(customPref.isWithinBudget(120), false);
    assert.strictEqual(customPref.isWithinWalkingLimit(10), true);
    assert.strictEqual(customPref.isWithinWalkingLimit(25), false);

    // Test conversion to CommuteConstraint
    const constraint = customPref.toConstraint();
    assert(constraint instanceof CommuteConstraint, 'Must convert to CommuteConstraint');
    assert.strictEqual(constraint.maxBudgetRupees, 80);
    assert.strictEqual(constraint.walkingToleranceMinutes, 15);
    assert.strictEqual(constraint.preference, 'fastest');
    assert.strictEqual(constraint.allowSharedRides, false);
    assert.strictEqual(constraint.requireWheelchairAccess, true);
  });

  test('Valid Preferences: Supports all valid route preference modes including reliable and rain-safe', () => {
    const preferences = ['balanced', 'fastest', 'cheapest', 'rain-safe', 'reliable'];
    for (const pref of preferences) {
      const validated = validateCommutePreferences({ route_preference: pref });
      assert.strictEqual(validated.route_preference, pref);
    }
  });

  // ==========================================================================
  // SUITE 3: INVALID TRANSPORT MODES
  // ==========================================================================
  test('Invalid Modes: Rejects unsupported or fantasy transport modes', () => {
    const invalidSets = [
      ['helicopter'],
      ['flight'],
      ['car'],
      ['ferry'],
      ['bullet_train'],
      [] // empty array rejected
    ];

    for (const set of invalidSets) {
      assert.throws(
        () => validateCommutePreferences({ preferred_modes: set }),
        /transport mode|enum|array/i,
        `Expected rejection for mode set: ${JSON.stringify(set)}`
      );
    }
  });

  // ==========================================================================
  // SUITE 4: INVALID CONSTRAINT VALUES
  // ==========================================================================
  test('Invalid Constraints: Rejects negative or out-of-bound constraint parameters', () => {
    // Negative budget
    assert.throws(
      () => validateCommutePreferences({ max_budget_rupees: -10 }),
      /cannot be negative/i
    );

    // Excessive budget > 2000
    assert.throws(
      () => validateCommutePreferences({ max_budget_rupees: 5000 }),
      /exceed/i
    );

    // Walking tolerance < 5 minutes
    assert.throws(
      () => validateCommutePreferences({ walking_tolerance_minutes: 2 }),
      /between 5 and 60|at least 5/i
    );

    // Walking tolerance > 60 minutes
    assert.throws(
      () => validateCommutePreferences({ walking_tolerance_minutes: 90 }),
      /between 5 and 60|cannot exceed 60/i
    );

    // Transfers < 0
    assert.throws(
      () => validateCommutePreferences({ max_transfers: -1 }),
      /between 0 and 5|cannot be negative/i
    );

    // Transfers > 5
    assert.throws(
      () => validateCommutePreferences({ max_transfers: 8 }),
      /between 0 and 5|cannot exceed 5/i
    );

    // Invalid route preference
    assert.throws(
      () => validateCommutePreferences({ route_preference: 'hyperspace' }),
      /Invalid enum value|enum/i
    );

    // Invalid arrival time format
    const invalidTimes = ['9:00', '25:00', '08:65', 'morning', '12:00 PM'];
    for (const time of invalidTimes) {
      assert.throws(
        () => validateCommutePreferences({ default_arrival_time: time }),
        /format|regex/i,
        `Expected rejection for invalid time format: ${time}`
      );
    }
  });

  // ==========================================================================
  // SUITE 5: OWNERSHIP & ACCESS CONTROL
  // ==========================================================================
  test('Ownership: Student can view and update their own preferences', () => {
    // Initial fetch provisions defaults
    const pref = studentCommutePreferenceService.getPreferences(student.id, student);
    assert.strictEqual(pref.user_id, student.id);
    assert(
      pref.default_destination_college.toLowerCase().includes('sanghvi college'),
      'Default destination college should match student college'
    );

    // Update own preferences
    const updated = studentCommutePreferenceService.updatePreferences(
      student.id,
      {
        max_budget_rupees: 120,
        walking_tolerance_minutes: 25,
        route_preference: 'cheapest'
      },
      student
    );

    assert.strictEqual(updated.max_budget_rupees, 120);
    assert.strictEqual(updated.walking_tolerance_minutes, 25);
    assert.strictEqual(updated.route_preference, 'cheapest');
  });

  test('Ownership: Imposter student is strictly forbidden from accessing another student preferences', () => {
    // Imposter attempting to read student's preferences
    assert.throws(
      () => studentCommutePreferenceService.getPreferences(student.id, imposter),
      (err) => err instanceof ForbiddenError && /permission|forbidden/i.test(err.message),
      'Imposter reading another student preferences must throw ForbiddenError'
    );

    // Imposter attempting to update student's preferences
    assert.throws(
      () => studentCommutePreferenceService.updatePreferences(
        student.id,
        { max_budget_rupees: 50 },
        imposter
      ),
      (err) => err instanceof ForbiddenError && /permission|forbidden/i.test(err.message),
      'Imposter updating another student preferences must throw ForbiddenError'
    );
  });

  test('Ownership: Admin user has legitimate permission to manage student preferences', () => {
    const pref = studentCommutePreferenceService.getPreferences(student.id, admin);
    assert.strictEqual(pref.user_id, student.id);

    const adminUpdated = studentCommutePreferenceService.updatePreferences(
      student.id,
      { max_transfers: 2 },
      admin
    );
    assert.strictEqual(adminUpdated.max_transfers, 2);
  });

  test('Ownership: Unauthenticated access is rejected with ForbiddenError', () => {
    assert.throws(
      () => studentCommutePreferenceService.getPreferences(student.id, null),
      (err) => err instanceof ForbiddenError,
      'Unauthenticated request must throw ForbiddenError'
    );
  });

  test('Ownership: Querying non-existent user throws NotFoundError', () => {
    assert.throws(
      () => studentCommutePreferenceService.getPreferences('usr-nonexistent-999', admin),
      (err) => err instanceof NotFoundError,
      'Non-existent user must throw NotFoundError'
    );
  });

  // ==========================================================================
  // SUITE 6: PRIVACY BOUNDARIES
  // ==========================================================================
  test('Privacy Boundaries: Rejects explicit forbidden tracking and address fields', () => {
    const forbiddenPayloads = [
      { home_address: '123 Marine Drive, Churchgate' },
      { residential_address: 'Flat 5B, Bandra' },
      { flat_no: '502' },
      { room_no: '12' },
      { house_no: 'B-14' },
      { gps_coordinates: '19.0760, 72.8777' },
      { coordinates: [19.07, 72.87] },
      { lat: 19.076, lon: 72.877 },
      { live_location: 'Station road' },
      { continuous_tracking: true },
      { location_history: ['point1', 'point2'] },
      { device_id: 'dev-9988-uuid' }
    ];

    for (const payload of forbiddenPayloads) {
      assert.throws(
        () => validateCommutePreferences(payload),
        /Privacy Boundary Violation|forbidden/i,
        `Expected privacy rejection for payload: ${JSON.stringify(payload)}`
      );

      assert.throws(
        () => studentCommutePreferenceService.updatePreferences(student.id, payload, student),
        /Privacy Boundary Violation|VALIDATION_ERROR|BadRequestError/i,
        `Expected service rejection for payload: ${JSON.stringify(payload)}`
      );
    }
  });

  test('Privacy Boundaries: Rejects granular residential addresses in default_origin_area', () => {
    const granularAddresses = [
      'Flat 402, Gokul Heights, Juhu',
      'Room 12, Chawl No 3, Andheri East',
      'Plot 45, Sector 12, Vashi',
      'Door No 5, Saraswati CHS, Dadar',
      'Bungalow 7, Janki Kutir, Juhu',
      'Wing A, Floor 8, Raheja Residency'
    ];

    for (const addr of granularAddresses) {
      assert.throws(
        () => validateCommutePreferences({ default_origin_area: addr }),
        /Excessive location precision detected|privacy/i,
        `Expected rejection for granular address: "${addr}"`
      );
    }
  });

  test('Privacy Boundaries: Rejects raw GPS coordinates and PIN codes in origin area', () => {
    const invalidTelemetry = [
      '19.1031, 72.8362',
      '19.076000, 72.877700',
      'lat: 19.12, lon: 72.84',
      '400058'
    ];

    for (const val of invalidTelemetry) {
      assert.throws(
        () => validateCommutePreferences({ default_origin_area: val }),
        /Excessive location precision detected|privacy/i,
        `Expected rejection for telemetry string: "${val}"`
      );
    }
  });

  test('Privacy Boundaries: Accepts safe coarse landmarks and localities', () => {
    const safeAreas = [
      'Borivali West',
      'Andheri Station',
      'Dadar East',
      'Bandra Kurla Complex',
      'D.J. Sanghvi College of Engineering',
      'Goregaon West'
    ];

    for (const area of safeAreas) {
      const validated = validateCommutePreferences({ default_origin_area: area });
      assert(validated.default_origin_area.length > 0, `Coarse area "${area}" must be accepted`);
    }
  });

  // ==========================================================================
  // SUITE 7: PIPELINE INTEGRATION & COMMUTE CONSTRAINT
  // ==========================================================================
  await asyncTest('Pipeline Integration: CommuteContextService enriches context with student preferences', async () => {
    // Setup specific student preference
    studentCommutePreferenceService.updatePreferences(
      student.id,
      {
        max_budget_rupees: 75,
        walking_tolerance_minutes: 12,
        route_preference: 'rain-safe',
        default_origin_area: 'Borivali West'
      },
      student
    );

    const context = await commuteContextService.collectContext(
      {
        startingArea: 'Borivali West',
        collegeDestination: 'D.J. Sanghvi College'
      },
      { studentId: student.id }
    );

    assert(context.studentPreferences !== null, 'Context must include studentPreferences');
    assert.strictEqual(context.studentPreferences.maxBudgetRupees, 75);
    assert.strictEqual(context.studentPreferences.walkingToleranceMinutes, 12);
    assert.strictEqual(context.studentPreferences.routePreference, 'rain-safe');
    assert.strictEqual(context.studentPreferences.defaultOriginArea, 'Borivali West');
  });

  test('Pipeline Integration: getCommuteConstraint applies per-request overrides gracefully', () => {
    const constraint = studentCommutePreferenceService.getCommuteConstraint(student.id, {
      maxBudgetRupees: 200 // per-request override
    });

    assert.strictEqual(constraint.maxBudgetRupees, 200);
    assert.strictEqual(constraint.walkingToleranceMinutes, 12); // retained from saved preference
    assert.strictEqual(constraint.preference, 'rain-safe');
  });

  // ==========================================================================
  // SUITE 8: PERSISTENCE ROUND-TRIP & RESET
  // ==========================================================================
  test('Persistence & Reset: Round-trip persistence and reset to default constraints', () => {
    // 1. Direct repo upsert and find
    const updated = studentCommutePreferenceRepository.upsert(student.id, {
      walking_tolerance_minutes: 35,
      max_transfers: 1,
      route_preference: 'reliable'
    });

    const retrieved = studentCommutePreferenceRepository.findByUserId(student.id);
    assert.strictEqual(retrieved.walking_tolerance_minutes, 35);
    assert.strictEqual(retrieved.max_transfers, 1);
    assert.strictEqual(retrieved.route_preference, 'reliable');

    // 2. Reset preferences to defaults
    const reset = studentCommutePreferenceService.resetPreferences(student.id, student);
    assert.strictEqual(reset.walking_tolerance_minutes, 20);
    assert.strictEqual(reset.max_transfers, 3);
    assert.strictEqual(reset.max_budget_rupees, 100);
    assert.strictEqual(reset.route_preference, 'balanced');
  });

  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCommutePreferenceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
