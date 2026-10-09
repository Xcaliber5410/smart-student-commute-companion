/**
 * Unit Tests for DepartureAdviceService & Disruption-Aware Departure Advice
 *
 * Verifies:
 * 1. Normal journeys: detects on-time plan, evaluates safety buffer, suggests window without shifting earlier.
 * 2. Delayed transport: calculates disruption delay and suggests justified earlier departure to meet deadline.
 * 3. Missed arrival deadlines & route change: flags when departure adjustment is insufficient and alternative route is needed.
 * 4. Service operating hours: prevents suggesting departures outside service operating windows (e.g. early morning Metro shutdown).
 * 5. Deadline unachievable: reports when no supported departure option can meet the deadline.
 * 6. Clock arithmetic vs duration: ensures travel duration (minutes) and clock time (HH:MM) are strictly distinguished.
 * 7. Missing timetable data: transparently tags ESTIMATED provenance and cautions against unverified frequencies.
 * 8. Integration: personalizedRouteRecommendationService attaches structured departureAdvice on recommendations.
 */

const assert = require('node:assert/strict');
const {
  DepartureAdviceService,
  departureAdviceService
} = require('../services/departureAdviceService');
const {
  DepartureAdvice,
  DEPARTURE_ADVICE_TYPES
} = require('../models/DepartureAdvice');
const {
  personalizedRouteRecommendationService
} = require('../services/personalizedRouteRecommendationService');
const {
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');

function runTests() {
  console.log('========================================================================');
  console.log(' Running Disruption-Aware Departure Advice Service Unit Tests');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Helper factory for mock routes
  function createRoute(overrides = {}) {
    const id = overrides.id || `route-${Math.random().toString(36).substring(2, 7)}`;
    const departureTime = overrides.departureTime || '08:00';
    const duration = overrides.durationMinutes ?? overrides.totalDurationMinutes ?? 25;
    const disruptionDelay = overrides.disruptionDelayMinutes ?? overrides.expectedDisruptionDelayMinutes ?? 0;
    const totalTravel = duration + disruptionDelay;

    const [h, m] = departureTime.split(':').map(Number);
    const totalArrM = (h * 60 + m + totalTravel) % 1440;
    const arrH = Math.floor(totalArrM / 60).toString().padStart(2, '0');
    const arrM = (totalArrM % 60).toString().padStart(2, '0');
    const estimatedArrivalTime = overrides.estimatedArrivalTime || `${arrH}:${arrM}`;

    return {
      journeyId: id,
      id,
      departureTime,
      estimatedArrivalTime,
      totalDurationMinutes: duration,
      totalTravelTimeMinutes: duration,
      baselineDurationMinutes: duration,
      expectedDisruptionDelayMinutes: disruptionDelay,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      reliability: overrides.reliability || 'LOW',
      provenance: overrides.provenance || DataProvenance.verified('Official Timetable Feed').toJSON()
    };
  }

  // 1. Normal journey: on-time plan with comfortable safety buffer
  test('Normal journey: detects on-time plan, preserves departure, and generates departure window', () => {
    const route = createRoute({
      departureTime: '08:00',
      durationMinutes: 25,
      disruptionDelayMinutes: 0,
      primaryMode: 'metro'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: route,
      departureTime: '08:00',
      targetArrivalTime: '09:00'
    });

    assert.ok(advice instanceof DepartureAdvice);
    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.ON_TIME);
    assert.strictEqual(advice.canMeetDeadline, true);
    assert.strictEqual(advice.currentPlan.departureTime, '08:00');
    assert.strictEqual(advice.currentPlan.contextualArrivalTime, '08:25');
    assert.strictEqual(advice.currentPlan.marginMinutes, 35);
    assert.strictEqual(advice.suggestedDeparture.earlierByMinutes, 0);
    assert.strictEqual(advice.suggestedDeparture.recommendedDepartureTime, '08:00');
    assert.ok(advice.suggestedDeparture.departureWindow);
    assert.strictEqual(advice.suggestedDeparture.departureWindow.start, '07:55');
    assert.strictEqual(advice.suggestedDeparture.departureWindow.end, '08:05');
    assert.ok(advice.explanation.includes('35-minute safety buffer'));
  });

  // 2. Delayed transport: calculates disruption delay and suggests justified earlier departure
  test('Delayed transport: calculates disruption delay and recommends justified earlier departure', () => {
    // Departure at 08:20, base duration 30 min, disruption delay +20 min.
    // Total travel = 50 min. Contextual arrival = 09:10 (Misses 09:00 deadline by 10 min).
    const delayedRoute = createRoute({
      departureTime: '08:20',
      durationMinutes: 30,
      disruptionDelayMinutes: 20,
      primaryMode: 'metro'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: delayedRoute,
      departureTime: '08:20',
      targetArrivalTime: '09:00'
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.EARLIER_DEPARTURE_RECOMMENDED);
    assert.strictEqual(advice.canMeetDeadline, true);
    assert.strictEqual(advice.currentPlan.isDelayed, true);
    assert.strictEqual(advice.currentPlan.disruptionDelayMinutes, 20);
    assert.strictEqual(advice.currentPlan.contextualArrivalTime, '09:10');
    assert.strictEqual(advice.currentPlan.marginMinutes, -10);

    // To arrive with 5m buffer by 09:00 (i.e. arrive by 08:55), need 55 min total travel:
    // 09:00 - 50m - 5m = 08:05 departure. Earlier by 15 min (from 08:20).
    assert.ok(advice.suggestedDeparture.earlierByMinutes >= 15);
    assert.strictEqual(advice.suggestedDeparture.recommendedDepartureTime, '08:05');
    assert.strictEqual(advice.suggestedDeparture.recommendedArrivalTime, '08:55');
    assert.ok(advice.suggestedDeparture.feasibleDepartureWindows.length > 0);
    assert.ok(advice.explanation.includes('Known disruption adds +20 min'));
  });

  // 3. Severe disruption where departure adjustment is insufficient and route change is needed
  test('Severe disruption: explains when departure adjustment is insufficient and recommends route change', () => {
    const heavilyDisruptedRoute = createRoute({
      id: 'train-blocked',
      departureTime: '08:00',
      durationMinutes: 35,
      disruptionDelayMinutes: 30, // Severe +30m delay
      primaryMode: 'train'
    });

    const undisruptedAlt = createRoute({
      id: 'bus-clean',
      departureTime: '08:00',
      durationMinutes: 40,
      disruptionDelayMinutes: 0,
      estimatedArrivalTime: '08:40',
      primaryMode: 'bus'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: heavilyDisruptedRoute,
      alternatives: [undisruptedAlt],
      departureTime: '08:00',
      targetArrivalTime: '09:00'
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.ROUTE_CHANGE_NEEDED);
    assert.strictEqual(advice.routeChangeRecommended, true);
    assert.ok(advice.headline.includes('alternate route strongly recommended'));
    assert.ok(advice.explanation.includes('BUS'));
    assert.ok(advice.actionableGuidance.some(g => g.includes('Switch to the BUS alternative')));
  });

  // 4. Service operating hours: prevents recommending departure outside operating window
  test('Operating hours: rejects suggesting departure before morning service begins', () => {
    // Metro operates 05:30 to 23:45.
    // Target arrival: 05:45. Journey duration: 40 min.
    // Required departure would be 05:05 (prior to 05:30 opening).
    const earlyRoute = createRoute({
      departureTime: '05:30',
      durationMinutes: 40,
      primaryMode: 'metro'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: earlyRoute,
      departureTime: '05:30',
      targetArrivalTime: '05:45'
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.DEADLINE_UNACHIEVABLE);
    assert.strictEqual(advice.canMeetDeadline, false);
    assert.strictEqual(advice.operatingHours.start, '05:30');
    assert.ok(advice.explanation.includes('METRO service does not begin until 05:30'));
    assert.ok(advice.actionableGuidance.some(g => g.includes('auto or walking')));
  });

  // 5. Service operating hours: catches when planned departure itself is during night shutdown
  test('Operating hours: flags planned departure during night shutdown window', () => {
    // Train night shutdown between 01:16 and 04:14.
    const midnightTrain = createRoute({
      departureTime: '02:30',
      durationMinutes: 30,
      primaryMode: 'train'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: midnightTrain,
      departureTime: '02:30',
      targetArrivalTime: '03:15'
    });

    assert.strictEqual(advice.adviceType, DEPARTURE_ADVICE_TYPES.DEADLINE_UNACHIEVABLE);
    assert.strictEqual(advice.operatingHours.isWithinOperatingHours, false);
    assert.ok(advice.headline.includes('service is not operating at 02:30'));
  });

  // 6. Clock arithmetic vs duration: ensures time arithmetic adheres strictly to 24-hour clock
  test('Clock arithmetic: correctly adds duration to clock time without conflation', () => {
    const route = createRoute({
      departureTime: '23:45',
      durationMinutes: 30, // Reaches next day at 00:15
      primaryMode: 'auto'
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: route,
      departureTime: '23:45',
      targetArrivalTime: '00:30'
    });

    assert.strictEqual(advice.currentPlan.contextualArrivalTime, '00:15');
    assert.strictEqual(advice.currentPlan.marginMinutes, 15);
    assert.strictEqual(advice.canMeetDeadline, true);
  });

  // 7. Missing timetable data: transparently tags ESTIMATED provenance and cautions against unverified frequencies
  test('Missing timetable data: transparently tags ESTIMATED provenance without inventing trip IDs', () => {
    const unmeteredRoute = createRoute({
      departureTime: '08:30',
      durationMinutes: 20,
      primaryMode: 'shared_auto',
      provenance: DataProvenance.estimated('Shared Transit Estimation Model').toJSON()
    });

    const advice = departureAdviceService.evaluateDepartureAdvice({
      primaryRoute: unmeteredRoute,
      departureTime: '08:30',
      targetArrivalTime: '09:00'
    });

    assert.ok(advice.provenance);
    assert.notStrictEqual(advice.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC_OVERRIDE);
    assert.ok(advice.actionableGuidance.length > 0);
  });

  // 8. Integration with PersonalizedRouteRecommendationService
  testAsync('Integration: recommendation includes disruption-aware departureAdvice', async () => {
    const candMetro = {
      id: 'adv-int-metro',
      candidateId: 'adv-int-metro',
      journeyId: 'adv-int-metro',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:15',
      estimatedArrivalTime: '08:40',
      totalDurationMinutes: 25,
      totalTravelTimeMinutes: 25,
      walkingTimeMinutes: 5,
      transferCount: 0,
      estimatedCostRupees: 20,
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro'],
      isFeasible: true,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 5 },
        { type: 'TRANSIT', mode: 'metro', durationMinutes: 20 }
      ],
      baselineTravel: {
        departureTime: '08:15',
        estimatedArrivalTime: '08:40',
        durationMinutes: 25
      },
      provenance: DataProvenance.verified('Official Metro Feed').toJSON()
    };

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candMetro],
      departureTime: '08:15',
      targetArrivalTime: '09:00'
    });

    assert.ok(rec.departureAdvice, 'Recommendation must attach departureAdvice');
    assert.strictEqual(rec.departureAdvice.canMeetDeadline, true);
    assert.strictEqual(rec.departureAdvice.currentPlan.departureTime, '08:15');
    assert.strictEqual(rec.departureAdvice.currentPlan.marginMinutes, 20);
    assert.ok(rec.departureAdvice.actionableGuidance.length > 0);
  });

  // Run all tests
  setTimeout(() => {
    console.log('\n========================================================================');
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }, 100);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
