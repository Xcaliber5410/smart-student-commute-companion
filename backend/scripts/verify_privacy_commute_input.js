/**
 * Verification Script: Privacy-Safe Commute Input & Abstractions
 *
 * Exhaustively tests:
 * 1. Valid input parsing & CommutePlanInputDTO construction
 * 2. Invalid inputs (missing required fields, identical endpoints, boundary checks)
 * 3. Unsupported transport modes rejection and deduplication
 * 4. Invalid arrival time formats and out-of-range hours/minutes
 * 5. Excessive / unsafe location precision (flat numbers, societies, roads, GPS coordinates, PIN codes)
 * 6. Malformed commute constraints (negative budget, excess walking, transfer limits)
 * 7. Privacy-sensitive fields rejection (GPS, home addresses, device IDs, coordinates)
 * 8. Safe area representation (CommuteArea classification and logging sanitization)
 * 9. Privacy-safe persistence guards on SavedRoute and StudentProfile
 */

const assert = require('assert');
const {
  CommuteArea,
  commuteAreaSchema,
  checkAreaGranularity,
  classifyAreaType,
  sanitizeAreaName,
  CommutePlanInputDTO,
  privacySafeCommuteInputSchema,
  FORBIDDEN_PRIVACY_FIELDS,
  findForbiddenPrivacyFields,
  SavedRoute,
  StudentProfile
} = require('../models');

const {
  commutePlanRequestSchema,
  studentProfileUpdateSchema,
  createSavedRouteSchema
} = require('../validators');

async function runPrivacyCommuteInputTests() {
  console.log('\n========================================================');
  console.log(' Running Privacy-Safe Commute Input & Schema Verification');
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

  // --------------------------------------------------------------------------
  // 1. VALID INPUT & DTO REPRESENTATION
  // --------------------------------------------------------------------------

  test('Valid Input: parses standard commute plan request and builds DTO', () => {
    const input = {
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College',
      desiredArrivalTime: '08:45',
      preferredModes: ['train', 'metro', 'auto'],
      preference: 'fastest',
      walkingToleranceMinutes: 15,
      maxBudgetRupees: 80,
      maxTransfers: 2,
      allowSharedRides: true
    };

    const dto = CommutePlanInputDTO.fromRequest(input);
    assert.strictEqual(dto.startingArea.name, 'Borivali West');
    assert.strictEqual(dto.startingArea.areaType, 'LOCALITY');
    assert.strictEqual(dto.collegeDestination.name, 'D.J. Sanghvi College');
    assert.strictEqual(dto.collegeDestination.areaType, 'COLLEGE');
    assert.strictEqual(dto.desiredArrivalTime, '08:45');
    assert.strictEqual(dto.preference, 'fastest');
    assert.strictEqual(dto.maxBudgetRupees, 80);

    const routingParams = dto.toEphemeralRoutingParams();
    assert.strictEqual(routingParams.origin, 'Borivali West');
    assert.strictEqual(routingParams.destination, 'D.J. Sanghvi College');
    assert.strictEqual(routingParams.desiredArrivalTime, '08:45');

    const constraint = dto.toConstraint();
    assert.strictEqual(constraint.isWithinBudget(75), true);
    assert.strictEqual(constraint.isWithinBudget(90), false);
  });

  test('Valid Input: supports alias fields (startingArea, collegeDestination)', () => {
    const input = {
      startingArea: 'Andheri Station',
      collegeDestination: 'VJTI College',
      desiredArrivalTime: '09:00'
    };

    const dto = CommutePlanInputDTO.fromRequest(input);
    assert.strictEqual(dto.startingArea.name, 'Andheri Station');
    assert.strictEqual(dto.startingArea.areaType, 'TRANSIT_HUB');
    assert.strictEqual(dto.collegeDestination.name, 'VJTI College');
    assert.strictEqual(dto.collegeDestination.areaType, 'COLLEGE');
    assert.strictEqual(dto.desiredArrivalTime, '09:00');
  });

  // --------------------------------------------------------------------------
  // 2. INVALID INPUT & BOUNDARY TESTS
  // --------------------------------------------------------------------------

  test('Invalid Input: rejects missing or empty required origin and destination', () => {
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      destination: 'VJTI College'
    }), /Starting area or origin landmark is required/);

    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West'
    }), /College destination is required/);

    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: '',
      destination: 'VJTI College'
    }), /at least 2 characters/);

    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'A',
      destination: 'VJTI College'
    }), /at least 2 characters/);
  });

  test('Invalid Input: rejects identical origin and destination', () => {
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'Borivali West'
    }), /College destination cannot be identical to the starting area/);

    assert.throws(() => commutePlanRequestSchema.parse({
      origin: 'Vile Parle',
      destination: 'vile parle'
    }), /Destination cannot be identical to origin/);
  });

  // --------------------------------------------------------------------------
  // 3. UNSUPPORTED TRANSPORT MODES
  // --------------------------------------------------------------------------

  test('Transport Modes: rejects unsupported modes and deduplicates valid ones', () => {
    const unsupported = ['car', 'bike', 'flight', 'ferry', 'helicopter', 'uber'];
    unsupported.forEach(badMode => {
      assert.throws(() => CommutePlanInputDTO.fromRequest({
        origin: 'Borivali West',
        destination: 'VJTI College',
        preferredModes: [badMode]
      }), /Invalid enum value/);
    });

    // Empty mode array rejected
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      preferredModes: []
    }), /At least one transport mode must be selected/);

    // Deduplication works
    const dto = CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      preferredModes: ['train', 'train', 'metro', 'train', 'metro']
    });
    assert.deepStrictEqual(dto.preferredModes, ['train', 'metro']);
  });

  // --------------------------------------------------------------------------
  // 4. INVALID ARRIVAL TIME VALIDATION
  // --------------------------------------------------------------------------

  test('Arrival Time: enforces strict 24-hour HH:MM format and valid hour/minute ranges', () => {
    const invalidTimes = [
      '24:00',     // Hour 24 invalid in HH:MM
      '25:30',     // Hour 25 out of range
      '08:60',     // Minute 60 out of range
      '09:75',     // Minute 75 out of range
      '8:15',      // Missing leading zero
      '9:00',      // Missing leading zero
      '09:00 AM',  // 12-hour format rejected
      '12:00 PM',  // 12-hour format rejected
      'morning',   // Textual rejected
      'now',       // Textual rejected
      '23-45'      // Wrong delimiter
    ];

    invalidTimes.forEach(badTime => {
      assert.throws(() => CommutePlanInputDTO.fromRequest({
        origin: 'Borivali West',
        destination: 'VJTI College',
        desiredArrivalTime: badTime
      }), /24-hour HH:MM format/, `Expected failure for time: ${badTime}`);
    });

    // Valid edge cases
    const validTimes = ['00:00', '00:01', '08:00', '12:30', '19:45', '23:59'];
    validTimes.forEach(goodTime => {
      const dto = CommutePlanInputDTO.fromRequest({
        origin: 'Borivali West',
        destination: 'VJTI College',
        desiredArrivalTime: goodTime
      });
      assert.strictEqual(dto.desiredArrivalTime, goodTime);
    });
  });

  // --------------------------------------------------------------------------
  // 5. EXCESSIVE / UNSAFE LOCATION PRECISION REJECTION
  // --------------------------------------------------------------------------

  test('Privacy: rejects granular residential addresses and flat numbers', () => {
    const granularAddresses = [
      'Flat 402, Sunshine Apts, Borivali West',
      'Room 12, Bldg 7, Andheri East',
      'Apt 301, Silver Residency, Dadar',
      'House #15, Cross Road, Bandra',
      'Unit 4B, Gokul Heaven Tower',
      'Wing C, Floor 8, Royal Heights',
      'Chawl Room 4, Kurla West',
      'Kholi No. 12, Dharavi'
    ];

    granularAddresses.forEach(addr => {
      assert.throws(() => new CommuteArea(addr), /Excessive location precision detected/, `Expected failure for: ${addr}`);
      assert.strictEqual(CommuteArea.isSafe(addr), false);
    });
  });

  test('Privacy: rejects housing societies, plot numbers, and PIN codes', () => {
    const societyAndPlots = [
      'Gokul CHS, Vile Parle West',
      'Plot 42, Sector 17, Vashi',
      'Road No. 4, Lane 2, Chembur',
      'Bandra West 400050',
      'Andheri East 400069'
    ];

    societyAndPlots.forEach(item => {
      assert.throws(() => new CommuteArea(item), /Excessive location precision detected/, `Expected failure for: ${item}`);
    });
  });

  test('Privacy: rejects raw GPS coordinates and lat/lon coordinate strings', () => {
    const rawCoords = [
      '19.0760, 72.8777',
      '19.123456, 72.845678',
      '-19.123, 72.845',
      'lat: 19.123, lon: 72.845',
      'latitude=19.12, longitude=72.84',
      'gps: 19.12, 72.84'
    ];

    rawCoords.forEach(coord => {
      assert.throws(() => new CommuteArea(coord), /Excessive location precision detected/, `Expected failure for: ${coord}`);
    });
  });

  // --------------------------------------------------------------------------
  // 6. MALFORMED COMMUTE CONSTRAINTS
  // --------------------------------------------------------------------------

  test('Constraints: rejects negative or excessive budgets and invalid walking tolerance', () => {
    // Negative budget
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      maxBudgetRupees: -20
    }), /Budget cannot be negative/);

    // Budget over ₹2000
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      maxBudgetRupees: 3000
    }), /Budget cannot exceed ₹2000/);

    // Walking tolerance under 5m
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      walkingToleranceMinutes: 3
    }), /Walking tolerance must be at least 5 minutes/);

    // Walking tolerance over 60m
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      walkingToleranceMinutes: 90
    }), /Walking tolerance cannot exceed 60 minutes/);

    // Negative transfers
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      maxTransfers: -1
    }), /Transfers cannot be negative/);

    // Transfers over 5
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      maxTransfers: 8
    }), /Transfers cannot exceed 5/);

    // Invalid preference
    assert.throws(() => CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'VJTI College',
      preference: 'supersonic'
    }), /Invalid enum value/);
  });

  // --------------------------------------------------------------------------
  // 7. PRIVACY-SENSITIVE FIELDS REJECTION
  // --------------------------------------------------------------------------

  test('Privacy: strictly rejects request payloads containing forbidden tracking or personal fields', () => {
    const sensitivePayloads = [
      { homeAddress: 'Flat 101, Borivali' },
      { home_address: 'Andheri West' },
      { residentialAddress: '12 Khar Road' },
      { exactLocation: '19.123, 72.845' },
      { coordinates: { lat: 19.12, lon: 72.84 } },
      { lat: 19.123, lon: 72.845 },
      { gps: true },
      { tracking: 'continuous' },
      { currentLocation: '19.12, 72.84' },
      { deviceId: 'dev-iphone-9988' },
      { imei: '123456789012345' },
      { macAddress: '00:1B:44:11:3A:B7' },
      { phoneNumber: '9876543210' },
      { email: 'student@example.com' }
    ];

    sensitivePayloads.forEach(extra => {
      const payload = {
        origin: 'Borivali West',
        destination: 'VJTI College',
        ...extra
      };

      assert.throws(
        () => CommutePlanInputDTO.fromRequest(payload),
        err => err.code === 'PRIVACY_VIOLATION' && err.message.includes('Privacy violation'),
        `Expected PRIVACY_VIOLATION for payload with: ${Object.keys(extra).join(',')}`
      );
    });

    // Helper findForbiddenPrivacyFields returns detected fields
    const detected = findForbiddenPrivacyFields({
      origin: 'Borivali West',
      destination: 'VJTI College',
      homeAddress: 'Somewhere',
      gps: true
    });
    assert.deepStrictEqual(detected.sort(), ['gps', 'homeAddress']);
  });

  // --------------------------------------------------------------------------
  // 8. LOGGING SANITIZATION & SAFE STRING REPRESENTATION
  // --------------------------------------------------------------------------

  test('Privacy Logging: sanitizes commute inputs and exposes zero coordinates or PII', () => {
    const raw = {
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College',
      desiredArrivalTime: '08:45',
      preferredModes: ['train', 'metro'],
      maxBudgetRupees: 80,
      authorization: 'Bearer secret-token-12345',
      userIp: '192.168.1.1'
    };

    const sanitized = CommutePlanInputDTO.sanitizeForLog(raw);
    assert.strictEqual(sanitized.startingArea, 'Borivali West');
    assert.strictEqual(sanitized.collegeDestination, 'D.J. Sanghvi College');
    assert.strictEqual(sanitized.desiredArrivalTime, '08:45');
    assert.strictEqual(sanitized.authorization, undefined);
    assert.strictEqual(sanitized.userIp, undefined);

    const dto = CommutePlanInputDTO.fromRequest({
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College'
    });

    const safeLogStr = dto.toSafeLog();
    assert.ok(safeLogStr.includes('from="Borivali West"'));
    assert.ok(safeLogStr.includes('to="D.J. Sanghvi College"'));
    assert.ok(!safeLogStr.includes('lat'));
    assert.ok(!safeLogStr.includes('gps'));
  });

  // --------------------------------------------------------------------------
  // 9. PRIVACY-SAFE PERSISTENCE (SAVED ROUTE & STUDENT PROFILE)
  // --------------------------------------------------------------------------

  test('Persistence: createSavedRouteSchema rejects granular addresses in shortcuts', () => {
    // Coarse areas succeed
    const validRoute = createSavedRouteSchema.parse({
      name: 'College Fast Route',
      origin: 'Borivali West',
      destination: 'D.J. Sanghvi College',
      preferred_mode: 'balanced'
    });
    assert.strictEqual(validRoute.name, 'College Fast Route');

    // Granular addresses rejected
    assert.throws(() => createSavedRouteSchema.parse({
      name: 'My Home Route',
      origin: 'Flat 402, Sunshine Apts, Borivali West',
      destination: 'D.J. Sanghvi College'
    }), /Excessive location precision detected/);
  });

  test('Persistence: studentProfileUpdateSchema rejects granular street addresses for home_area', () => {
    // Coarse home area succeeds
    const validProfile = studentProfileUpdateSchema.parse({
      home_area: 'Andheri West',
      default_college: 'D.J. Sanghvi College'
    });
    assert.strictEqual(validProfile.home_area, 'Andheri West');

    // Granular home address rejected
    assert.throws(() => studentProfileUpdateSchema.parse({
      home_area: 'Room 12, Bldg 4, Sunshine CHS, Andheri'
    }), /Excessive location precision detected/);

    // Raw GPS coordinates rejected
    assert.throws(() => studentProfileUpdateSchema.parse({
      home_area: '19.123456, 72.845678'
    }), /Excessive location precision detected/);
  });

  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPrivacyCommuteInputTests().catch(err => {
    console.error('Fatal error during privacy commute input test:', err);
    process.exit(1);
  });
}

module.exports = { runPrivacyCommuteInputTests };
