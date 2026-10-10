/**
 * Unit Tests for RecommendationExplanationService & Explanation Layer
 *
 * Verifies:
 * 1. Normal recommendation explanation: explains selection, travel time, arrival time, and on-time buffer.
 * 2. Disrupted scenario: explains known disruption delay, affected corridors, and when alternatives avoid disruptions.
 * 3. Trade-offs: explains trade-offs like "The lower-cost option takes longer than the fastest feasible route."
 * 4. Circumstances for alternatives: explains when alternatives are preferable (disruption avoidance, saving money, fewer transfers).
 * 5. Preference satisfaction: grounds explanations in actual student preferences (fastest, cheapest, fewest_transfers, preferred_modes).
 * 6. Missing information and uncertainty: transparently reports missing cost or high traffic variance without fabricating data.
 * 7. Multi-tier provenance: categorizes VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC facts honestly.
 * 8. Pure determinism across repeated requests.
 * 9. Integration with PersonalizedRouteRecommendationService: recommendation attaches structured explanation.
 */

const assert = require('node:assert/strict');
const {
  RecommendationExplanationService,
  recommendationExplanationService
} = require('../services/recommendationExplanationService');
const {
  PersonalizedRecommendationExplanation
} = require('../models/PersonalizedRecommendationExplanation');
const {
  personalizedRouteRecommendationService
} = require('../services/personalizedRouteRecommendationService');
const {
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');

function runTests() {
  console.log('========================================================================');
  console.log(' Running Recommendation Explanation Service Unit Tests');
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

  // Helper factory for mock normalized routes
  function createMockRoute(overrides = {}) {
    const id = overrides.id || overrides.journeyId || `route-${Math.random().toString(36).substring(2, 7)}`;
    const departureTime = overrides.departureTime || '08:00';
    const duration = overrides.totalTravelTimeMinutes ?? overrides.totalDurationMinutes ?? 25;
    const [h, m] = departureTime.split(':').map(Number);
    const totalArrM = (h * 60 + m + duration) % 1440;
    const arrH = Math.floor(totalArrM / 60).toString().padStart(2, '0');
    const arrM = (totalArrM % 60).toString().padStart(2, '0');
    const estimatedArrivalTime = overrides.estimatedArrivalTime || `${arrH}:${arrM}`;

    return {
      journeyId: id,
      id,
      departureTime,
      estimatedArrivalTime,
      totalTravelTimeMinutes: duration,
      totalDurationMinutes: duration,
      walkingTimeMinutes: overrides.walkingTimeMinutes ?? 5,
      transfers: overrides.transfers ?? 0,
      numberOfTransfers: overrides.transfers ?? 0,
      estimatedCostRupees: overrides.estimatedCostRupees !== undefined ? overrides.estimatedCostRupees : 20,
      expectedDisruptionDelayMinutes: overrides.expectedDisruptionDelayMinutes ?? 0,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      reliability: overrides.reliability || 'LOW',
      affectedSegments: overrides.affectedSegments || [],
      provenance: overrides.provenance || DataProvenance.verified('Official Metro Feed').toJSON()
    };
  }

  // 1. Normal recommendation explanation
  test('Normal scenario: explains selection reason, travel duration, arrival time, and buffer', () => {
    const primary = createMockRoute({
      id: 'metro-fast',
      primaryMode: 'metro',
      totalTravelTimeMinutes: 25,
      departureTime: '08:00',
      estimatedArrivalTime: '08:25',
      transfers: 0,
      estimatedCostRupees: 20
    });
    const alt = createMockRoute({
      id: 'bus-slow',
      primaryMode: 'bus',
      totalTravelTimeMinutes: 40,
      departureTime: '08:00',
      estimatedArrivalTime: '08:40',
      transfers: 1,
      estimatedCostRupees: 15
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: primary,
      alternatives: [alt],
      targetArrivalTime: '09:00',
      preferences: { route_preference: 'fastest' }
    });

    assert.ok(explanation instanceof PersonalizedRecommendationExplanation);
    assert.strictEqual(explanation.primaryRouteId, 'metro-fast');
    // Summary explains fewer transfers and arriving on time
    assert.ok(explanation.summary.includes('fewer transfers') || explanation.summary.includes('arrives before'));
    // Timing explanation
    assert.strictEqual(explanation.timingExplanation.travelTimeMinutes, 25);
    assert.strictEqual(explanation.timingExplanation.departureTime, '08:00');
    assert.strictEqual(explanation.timingExplanation.estimatedArrivalTime, '08:25');
    assert.strictEqual(explanation.timingExplanation.targetArrivalTime, '09:00');
    assert.strictEqual(explanation.timingExplanation.marginMinutes, 35);
    assert.strictEqual(explanation.timingExplanation.isPunctual, true);
    assert.ok(explanation.timingExplanation.narrative.includes('35 min buffer'));
  });

  // 2. Disrupted scenario & alternative avoiding disruption
  test('Disrupted scenario: explains disruption impact and when alternative avoids disruption', () => {
    const primaryDisrupted = createMockRoute({
      id: 'train-delayed',
      primaryMode: 'train',
      totalTravelTimeMinutes: 35,
      expectedDisruptionDelayMinutes: 15,
      walkingTimeMinutes: 4,
      affectedSegments: [{ corridor: 'Western Line', delay: 15 }]
    });
    const altCleanBus = createMockRoute({
      id: 'bus-avoiding',
      primaryMode: 'bus',
      totalTravelTimeMinutes: 38,
      expectedDisruptionDelayMinutes: 0,
      walkingTimeMinutes: 12 // adds walking time
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: primaryDisrupted,
      alternatives: [altCleanBus],
      context: {
        disruptions: [{ description: 'Western Line signaling failure' }]
      }
    });

    // Primary route disruption explanation
    assert.strictEqual(explanation.disruptionEffects.hasDisruptions, true);
    assert.strictEqual(explanation.disruptionEffects.delayMinutes, 15);
    assert.ok(explanation.disruptionEffects.narrative.includes('+15 min expected delay'));
    assert.strictEqual(explanation.disruptionEffects.dataTier, PROVENANCE_TIERS.USER_REPORTED);

    // Alternative circumstance explanation
    const altExpl = explanation.alternativeExplanations.find(a => a.alternativeJourneyId === 'bus-avoiding');
    assert.ok(altExpl, 'Alternative explanation must be present');
    assert.ok(altExpl.preferableWhen.includes('bypass active transit delays'));
    // Checks the exact example style: "This alternative avoids the reported train disruption but adds walking time."
    assert.strictEqual(altExpl.tradeOffNarrative, 'This alternative avoids the reported train disruption but adds walking time.');
  });

  // 3. Trade-offs: lower cost takes longer than fastest feasible route
  test('Trade-offs: explains when lower-cost option takes longer than fastest route', () => {
    const fastest = createMockRoute({
      id: 'metro-fast',
      primaryMode: 'metro',
      totalTravelTimeMinutes: 20,
      estimatedCostRupees: 35
    });
    const cheaperSlower = createMockRoute({
      id: 'bus-cheap',
      primaryMode: 'bus',
      totalTravelTimeMinutes: 38,
      estimatedCostRupees: 10
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: fastest,
      alternatives: [cheaperSlower],
      preferences: { route_preference: 'fastest' }
    });

    // Checks trade-offs include lower-cost option taking longer
    const costTradeOff = explanation.tradeOffs.find(t => t.includes('lower-cost option takes longer than the fastest feasible route'));
    assert.ok(costTradeOff, 'Must explain lower-cost option taking longer than fastest route');

    // Alternative explanation describes circumstance for student
    const altExpl = explanation.alternativeExplanations.find(a => a.alternativeJourneyId === 'bus-cheap');
    assert.ok(altExpl.preferableWhen.includes('prioritize lowest cost over speed'));
    assert.ok(altExpl.tradeOffNarrative.includes('The lower-cost option takes longer than the fastest feasible route'));
  });

  // 4. Preference satisfaction matching actual preferences
  test('Preference satisfaction: explains matched preferences accurately', () => {
    const route = createMockRoute({
      id: 'train-direct',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      totalTravelTimeMinutes: 28,
      transfers: 0,
      walkingTimeMinutes: 6,
      estimatedCostRupees: 15
    });

    // 4A: Preferred modes match
    const expModes = recommendationExplanationService.explainRecommendation({
      primaryRoute: route,
      preferences: { preferred_modes: ['train'], route_preference: 'fewest_transfers' }
    });
    const modePref = expModes.satisfiedPreferences.find(p => p.preference === 'preferred_modes');
    assert.ok(modePref && modePref.isSatisfied);
    assert.ok(modePref.detail.includes('train'));

    const transPref = expModes.satisfiedPreferences.find(p => p.preference.includes('fewest_transfers'));
    assert.ok(transPref && transPref.isSatisfied);
    assert.ok(transPref.detail.includes('0-transfer'));

    // 4B: Least walking preference
    const expWalking = recommendationExplanationService.explainRecommendation({
      primaryRoute: route,
      preferences: { route_preference: 'least_walking' },
      constraints: { maxWalkingMinutes: 10 }
    });
    const walkPref = expWalking.satisfiedPreferences.find(p => p.preference.includes('least_walking'));
    assert.ok(walkPref && walkPref.isSatisfied);
    assert.ok(walkPref.detail.includes('6 mins'));
  });

  // 5. Incomplete information and uncertainty transparency (no data fabrication)
  test('Uncertainty transparency: honestly reports missing fare and high traffic without fabrication', () => {
    const autoRoute = createMockRoute({
      id: 'auto-route',
      primaryMode: 'auto',
      estimatedCostRupees: null, // Fare missing!
      reliability: 'HIGH', // High traffic uncertainty
      provenance: DataProvenance.estimated('Traffic Estimation Engine').toJSON()
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: autoRoute,
      context: {
        weatherContext: { condition: 'heavy_rain' }
      }
    });

    assert.ok(explanation.uncertaintyAndMissingInfo.missingFields.includes('exact_transit_cost'));
    assert.ok(explanation.uncertaintyAndMissingInfo.narrative.includes('Fare estimate is unavailable for private auto connections'));
    assert.ok(explanation.uncertaintyAndMissingInfo.uncertainFactors.includes('real_time_congestion_variance'));
    assert.ok(explanation.uncertaintyAndMissingInfo.uncertainFactors.includes('weather_slowdown_uncertainty'));
    assert.ok(explanation.uncertaintyAndMissingInfo.level === 'HIGH' || explanation.uncertaintyAndMissingInfo.level === 'SEVERE');
  });

  // 6. Multi-tier provenance categorization
  test('Provenance breakdown: distinguishes VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC facts', () => {
    const synthRoute = createMockRoute({
      id: 'synth-route',
      provenance: DataProvenance.synthetic('Synthetic Commute Modeler').toJSON(),
      expectedDisruptionDelayMinutes: 10
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: synthRoute,
      context: {
        disruptions: [{ description: 'Reported waterlogging' }]
      }
    });

    const prov = explanation.provenanceBreakdown;
    assert.ok(prov.syntheticFacts.length > 0, 'Synthetic facts must be present');
    assert.ok(prov.userReportedFacts.length > 0, 'User reported delay facts must be present');
    assert.ok(prov.estimatedFacts.length > 0, 'Estimated travel time facts must be present');
  });

  // 7. Determinism across identical calls
  test('Determinism: repeated invocations produce bit-for-bit identical explanation objects', () => {
    const r1 = createMockRoute({ id: 'det-r1', totalTravelTimeMinutes: 25, estimatedCostRupees: 20 });
    const r2 = createMockRoute({ id: 'det-r2', totalTravelTimeMinutes: 35, estimatedCostRupees: 15 });
    const params = {
      recommendationId: 'rec-det-test',
      primaryRoute: r1,
      alternatives: [r2],
      targetArrivalTime: '09:00',
      preferences: { route_preference: 'fastest' }
    };

    const run1 = recommendationExplanationService.explainRecommendation(params).toJSON();
    const run2 = recommendationExplanationService.explainRecommendation(params).toJSON();

    assert.deepStrictEqual(run1.summary, run2.summary);
    assert.deepStrictEqual(run1.selectionReason, run2.selectionReason);
    assert.deepStrictEqual(run1.timingExplanation, run2.timingExplanation);
    assert.deepStrictEqual(run1.satisfiedPreferences, run2.satisfiedPreferences);
    assert.deepStrictEqual(run1.tradeOffs, run2.tradeOffs);
    assert.deepStrictEqual(run1.alternativeExplanations, run2.alternativeExplanations);
  });

  // 8. Integration with PersonalizedRouteRecommendationService
  testAsync('Integration: personalizedRouteRecommendationService returns structured explanation on recommendation', async () => {
    const candMetro = {
      id: 'int-metro',
      candidateId: 'int-metro',
      journeyId: 'int-metro',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      estimatedArrivalTime: '08:25',
      totalDurationMinutes: 25,
      totalTravelTimeMinutes: 25,
      walkingTimeMinutes: 5,
      transferCount: 0,
      numberOfTransfers: 0,
      estimatedCostRupees: 20,
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro'],
      isFeasible: true,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 5 },
        { type: 'TRANSIT', mode: 'metro', durationMinutes: 20 }
      ],
      baselineTravel: {
        departureTime: '08:00',
        estimatedArrivalTime: '08:25',
        durationMinutes: 25,
        walkingTimeMinutes: 5,
        transferCount: 0,
        estimatedCostRupees: 20
      },
      provenance: DataProvenance.verified('Official Metro Schedule').toJSON()
    };

    const candBus = {
      id: 'int-bus',
      candidateId: 'int-bus',
      journeyId: 'int-bus',
      origin: 'Andheri West',
      destination: 'D.J. Sanghvi College of Engineering',
      departureTime: '08:00',
      estimatedArrivalTime: '08:42',
      totalDurationMinutes: 42,
      totalTravelTimeMinutes: 42,
      walkingTimeMinutes: 8,
      transferCount: 1,
      numberOfTransfers: 1,
      estimatedCostRupees: 10,
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      isFeasible: true,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 8 },
        { type: 'TRANSIT', mode: 'bus', durationMinutes: 34 }
      ],
      baselineTravel: {
        departureTime: '08:00',
        estimatedArrivalTime: '08:42',
        durationMinutes: 42,
        walkingTimeMinutes: 8,
        transferCount: 1,
        estimatedCostRupees: 10
      },
      provenance: DataProvenance.verified('BEST Bus Schedule').toJSON()
    };

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candMetro, candBus],
      targetArrivalTime: '09:00',
      preferences: { route_preference: 'fastest' }
    });

    assert.ok(rec, 'Recommendation must exist');
    assert.ok(rec.explanation, 'Structured explanation must be present on recommendation');
    assert.strictEqual(rec.explanation.primaryRouteId, 'int-metro');
    assert.strictEqual(rec.explanation.timingExplanation.travelTimeMinutes, 25);
    assert.strictEqual(rec.explanation.timingExplanation.isPunctual, true);
    assert.ok(rec.explanation.alternativeExplanations.length > 0);
  });

  // 9. Exact Example Summary Phrasing:
  // "Recommended because this route has fewer transfers and is estimated to arrive before your 9:00 AM class."
  test('9. Produces exact contextual summary when route has fewer transfers and arrives before 9:00 AM class', () => {
    const primaryRoute = createMockRoute({
      id: 'primary-0-transfers',
      transfers: 0,
      departureTime: '08:00',
      totalTravelTimeMinutes: 45,
      estimatedArrivalTime: '08:45'
    });
    const alternativeRoute = createMockRoute({
      id: 'alt-1-transfer',
      transfers: 1,
      departureTime: '08:00',
      totalTravelTimeMinutes: 50,
      estimatedArrivalTime: '08:50'
    });

    const academicContext = {
      hasAcademicContext: true,
      isDestinationMatched: true,
      nextClass: {
        startTimeHHMM: '09:00',
        title: null,
        eventType: 'class'
      }
    };

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute,
      alternatives: [alternativeRoute],
      academicContext
    });

    assert.strictEqual(
      explanation.summary,
      'Recommended because this route has fewer transfers and is estimated to arrive before your 9:00 AM class.'
    );
  });

  // 10. Fastest route truthfulness:
  // Never claims route is fastest unless evaluated candidates support that conclusion
  test('10. Never claims route is fastest when a faster candidate exists', () => {
    const fasterAlt = createMockRoute({
      id: 'faster-bike',
      primaryMode: 'bike',
      totalTravelTimeMinutes: 18,
      transfers: 0,
      estimatedCostRupees: 50
    });
    const primaryRoute = createMockRoute({
      id: 'slower-metro',
      primaryMode: 'metro',
      totalTravelTimeMinutes: 30, // Slower than fasterAlt (18m)
      transfers: 0,
      estimatedCostRupees: 15
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute,
      alternatives: [fasterAlt],
      preferences: { route_preference: 'fastest' }
    });

    // Summary must NOT claim offers fastest travel time
    assert.ok(!explanation.summary.includes('fastest travel time'), 'Must not claim fastest travel time');
    // Selection reason must not claim shortest overall commute
    assert.ok(!explanation.selectionReason.includes('shortest overall commute'), 'Must not claim shortest overall commute');
    // Satisfied preferences must mark fastest as FALSE with honest detail
    const fastestPref = explanation.satisfiedPreferences.find(p => p.preference.includes('fastest'));
    assert.ok(fastestPref, 'Fastest preference must be present');
    assert.strictEqual(fastestPref.isSatisfied, false, 'Fastest preference must be false when faster alternative exists');
    assert.ok(fastestPref.detail.includes('faster alternative exists (18 mins)'));

    // Trade-offs must NOT label primary as "the fastest feasible route"
    const erroneousClaim = explanation.tradeOffs.find(t => t.includes('takes longer than the fastest feasible route'));
    assert.strictEqual(erroneousClaim, undefined, 'Must not claim lower-cost option takes longer than fastest route when primary is not fastest');
  });

  // 11. Cheapest route truthfulness:
  // Never claims route is cheapest when a cheaper candidate exists; flags unverified cost when null
  test('11. Truthfully evaluates cheapest preference without claiming unverified cost', () => {
    const cheaperAlt = createMockRoute({
      id: 'bus-cheap',
      primaryMode: 'bus',
      totalTravelTimeMinutes: 45,
      estimatedCostRupees: 10
    });
    const primaryRoute = createMockRoute({
      id: 'metro-primary',
      primaryMode: 'metro',
      totalTravelTimeMinutes: 25,
      estimatedCostRupees: 30
    });

    const expWithCost = recommendationExplanationService.explainRecommendation({
      primaryRoute,
      alternatives: [cheaperAlt],
      preferences: { route_preference: 'cheapest' }
    });

    const cheapPref = expWithCost.satisfiedPreferences.find(p => p.preference.includes('cheapest'));
    assert.ok(cheapPref);
    assert.strictEqual(cheapPref.isSatisfied, false, 'Cheapest preference must be false when cheaper alternative exists');
    assert.ok(cheapPref.detail.includes('lower-cost option exists (₹10)'));

    // With null cost
    const unmeteredRoute = createMockRoute({
      id: 'auto-unmetered',
      estimatedCostRupees: null
    });
    const expNullCost = recommendationExplanationService.explainRecommendation({
      primaryRoute: unmeteredRoute,
      preferences: { route_preference: 'cheapest' }
    });
    const nullPref = expNullCost.satisfiedPreferences.find(p => p.preference.includes('cheapest'));
    assert.ok(nullPref);
    assert.strictEqual(nullPref.isSatisfied, false);
    assert.ok(nullPref.detail.includes('Fare data is unavailable'));
  });

  // 12. Schedule alignment honesty:
  // When destination does not match, never claims arrival before class
  test('12. Never claims class arrival when destination is unmatched or arrival is after class start', () => {
    const primaryRoute = createMockRoute({
      id: 'route-unmatched',
      transfers: 0,
      departureTime: '08:00',
      totalTravelTimeMinutes: 40,
      estimatedArrivalTime: '08:40'
    });

    // Case A: Destination not matched
    const expUnmatched = recommendationExplanationService.explainRecommendation({
      primaryRoute,
      alternatives: [createMockRoute({ transfers: 1 })],
      academicContext: {
        hasAcademicContext: true,
        isDestinationMatched: false,
        nextClass: { startTimeHHMM: '09:00', location: 'VJTI Matunga' }
      }
    });

    assert.ok(!expUnmatched.summary.includes('09:00'), 'Must not claim arrival before class when destination is unmatched');
    assert.ok(!expUnmatched.summary.includes('class'), 'Must not claim arrival before class when destination is unmatched');
    assert.strictEqual(expUnmatched.academicScheduleExplanation.isDestinationMatched, false);

    // Case B: Arrival after class start
    const lateRoute = createMockRoute({
      id: 'route-late',
      transfers: 0,
      departureTime: '08:30',
      totalTravelTimeMinutes: 45,
      estimatedArrivalTime: '09:15' // Arrives after 09:00 class
    });
    const expLate = recommendationExplanationService.explainRecommendation({
      primaryRoute: lateRoute,
      academicContext: {
        hasAcademicContext: true,
        isDestinationMatched: true,
        nextClass: { startTimeHHMM: '09:00', title: 'Data Structures' }
      }
    });

    const schedPref = expLate.satisfiedPreferences.find(p => p.preference === 'academic_schedule');
    assert.ok(schedPref);
    assert.strictEqual(schedPref.isSatisfied, false, 'Must be marked false when arriving after class start');
    assert.ok(schedPref.detail.includes('after upcoming class'));
  });

  // 13. Why an earlier departure may help:
  // Explains delay absorption and punctuality buffer preservation
  test('13. Explains why earlier departure helps when disrupted or tight schedule margin', () => {
    const disruptedRoute = createMockRoute({
      id: 'route-disrupted',
      departureTime: '08:15',
      totalTravelTimeMinutes: 45,
      estimatedArrivalTime: '09:00', // Leaves 0 margin for 09:00 class
      expectedDisruptionDelayMinutes: 15
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: disruptedRoute,
      academicContext: {
        hasAcademicContext: true,
        isDestinationMatched: true,
        nextClass: { startTimeHHMM: '09:00', title: 'Signals and Systems' }
      }
    });

    assert.ok(explanation.earlierDepartureExplanation);
    assert.strictEqual(explanation.earlierDepartureExplanation.isEarlierDepartureRecommended, true);
    assert.ok(explanation.earlierDepartureExplanation.earlierByMinutes >= 15);
    assert.ok(explanation.earlierDepartureExplanation.recommendedDepartureTime !== null);
    // Explains why earlier departure helps
    const reasons = explanation.earlierDepartureExplanation.reasons;
    assert.ok(reasons.some(r => r.includes('Absorbs +15 min')));
    assert.ok(explanation.earlierDepartureExplanation.narrative.includes('is recommended'));
    assert.ok(explanation.timingExplanation.narrative.includes('Departing earlier'));
  });

  // 14. On-time journey without disruptions:
  // Clarifies that earlier departure is not required
  test('14. Reports earlier departure not required for on-time journey with comfortable buffer', () => {
    const onTimeRoute = createMockRoute({
      id: 'route-ontime',
      departureTime: '08:00',
      totalTravelTimeMinutes: 25,
      estimatedArrivalTime: '08:25',
      expectedDisruptionDelayMinutes: 0
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: onTimeRoute,
      targetArrivalTime: '09:00'
    });

    assert.ok(explanation.earlierDepartureExplanation);
    assert.strictEqual(explanation.earlierDepartureExplanation.isEarlierDepartureRecommended, false);
    assert.strictEqual(explanation.earlierDepartureExplanation.earlierByMinutes, 0);
    assert.ok(explanation.earlierDepartureExplanation.narrative.includes('without requiring an earlier departure'));
  });

  // 15. Exam day elevated safety buffer:
  // Explains why earlier departure provides required 20-minute buffer for exams
  test('15. Explains elevated 20-minute safety buffer for exam day schedules', () => {
    const examRoute = createMockRoute({
      id: 'route-exam',
      departureTime: '08:00',
      totalTravelTimeMinutes: 50,
      estimatedArrivalTime: '08:50' // Only 10 min margin, but exam requires 20 min
    });

    const explanation = recommendationExplanationService.explainRecommendation({
      primaryRoute: examRoute,
      academicContext: {
        hasAcademicContext: true,
        isDestinationMatched: true,
        isExamDay: true,
        nextClass: { startTimeHHMM: '09:00', title: 'Midterm Exam', eventType: 'exam' }
      }
    });

    assert.ok(explanation.earlierDepartureExplanation);
    assert.strictEqual(explanation.earlierDepartureExplanation.isEarlierDepartureRecommended, true);
    const reasons = explanation.earlierDepartureExplanation.reasons;
    assert.ok(reasons.some(r => r.includes('20-minute safety buffer before your scheduled exam')));
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

