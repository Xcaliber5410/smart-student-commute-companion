/**
 * Verification Test Battery: Day 16 Weather Context Integration
 *
 * Validates:
 * 1. Normal/clear weather (0 min added road delay, no walking penalty, low uncertainty)
 * 2. Moderate rain (increased walking inconvenience, moderate road delay, travel uncertainty buffer)
 * 3. Heavy monsoon rain (substantial walking inconvenience, road delays, waterlogging advisories)
 * 4. Severe storm weather (extreme walking inconvenience, major road delays, severe travel uncertainty without arbitrarily declaring route impossible)
 * 5. Extreme heat (heat index, walking fatigue on outdoor walk segments, hydration warnings)
 * 6. Expired weather context (expired forecasts filtered out; falls back to default clean conditions)
 * 7. 4-tier provenance propagation (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 8. Route impact on realistic multimodal candidate journey (walk + train + metro + auto)
 * 9. CommuteContextService integration (enriches Stage 1 context with normalized weatherContext)
 */

const assert = require('assert');
const {
  WEATHER_CONDITIONS,
  WALKING_INCONVENIENCE_LEVELS,
  TRAVEL_UNCERTAINTY_LEVELS,
  OUTDOOR_EXPOSURE_RISKS,
  WeatherCondition,
  WeatherContext,
  JourneyWeatherImpact
} = require('../models/WeatherCondition');
const {
  CommuteJourney,
  JourneySegment,
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES
} = require('../models');
const { weatherContextService, WeatherContextService } = require('../services/weatherContextService');
const { commuteContextService } = require('../services/commuteContextService');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

// Helper: builds a standard road journey (Auto-rickshaw from Andheri to DJSCE)
function createRoadJourney() {
  return new CommuteJourney({
    id: 'journey-auto-djsce',
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '08:15',
    estimatedArrivalTime: '08:35',
    totalDurationMinutes: 20,
    totalWaitingTimeMinutes: 0,
    walkingTimeMinutes: 0,
    transitTimeMinutes: 20,
    totalDistanceKm: 4.5,
    transferCount: 0,
    estimatedCostRupees: 45,
    primaryMode: 'auto',
    modesIncluded: ['auto'],
    isViable: true,
    provenance: DataProvenance.estimated('Test Fixture').toJSON(),
    segments: [
      new JourneySegment({
        segmentIndex: 0,
        type: 'auto',
        mode: 'auto',
        from: 'Andheri West',
        to: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:15',
        arrivalTime: '08:35',
        durationMinutes: 20,
        waitingTimeMinutes: 0,
        distanceKm: 4.5,
        fareRupees: 45,
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      })
    ]
  });
}

// Helper: builds a multimodal journey (Walk + Train + Metro + Auto)
function createMultimodalJourney() {
  return new CommuteJourney({
    id: 'journey-multimodal-borivali-djsce',
    origin: 'Borivali West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '07:45',
    estimatedArrivalTime: '08:45',
    totalDurationMinutes: 60,
    totalWaitingTimeMinutes: 6,
    walkingTimeMinutes: 10,
    transitTimeMinutes: 44,
    totalDistanceKm: 22.0,
    transferCount: 2,
    estimatedCostRupees: 40,
    primaryMode: 'train',
    modesIncluded: ['walk', 'train', 'metro', 'auto'],
    isViable: true,
    provenance: DataProvenance.estimated('Test Fixture').toJSON(),
    segments: [
      // Segment 0: Walk to station (10 min outdoor walk)
      new JourneySegment({
        segmentIndex: 0,
        type: 'walk',
        mode: 'walk',
        from: 'Borivali Home',
        to: 'Borivali Station West',
        departureTime: '07:45',
        arrivalTime: '07:55',
        durationMinutes: 10,
        waitingTimeMinutes: 0,
        distanceKm: 0.8,
        fareRupees: 0,
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      // Segment 1: Western Railway Suburban Local (25 min sheltered rail)
      new JourneySegment({
        segmentIndex: 1,
        type: 'transit',
        mode: 'train',
        from: 'Borivali Station',
        to: 'Andheri Station',
        departureTime: '07:57',
        arrivalTime: '08:22',
        durationMinutes: 25,
        waitingTimeMinutes: 2,
        distanceKm: 15.0,
        fareRupees: 10,
        serviceId: 'WR-FAST-0801',
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      // Segment 2: Mumbai Metro Line 1 (10 min sheltered transit)
      new JourneySegment({
        segmentIndex: 2,
        type: 'transit',
        mode: 'metro',
        from: 'Andheri Metro',
        to: 'DN Nagar Metro',
        departureTime: '08:26',
        arrivalTime: '08:36',
        durationMinutes: 10,
        waitingTimeMinutes: 4,
        distanceKm: 3.2,
        fareRupees: 10,
        lineIdentifier: 'Line-1',
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      }),
      // Segment 3: Auto Rickshaw to DJSCE (9 min surface road transit)
      new JourneySegment({
        segmentIndex: 3,
        type: 'auto',
        mode: 'auto',
        from: 'DN Nagar Metro',
        to: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:36',
        arrivalTime: '08:45',
        durationMinutes: 9,
        waitingTimeMinutes: 0,
        distanceKm: 2.0,
        fareRupees: 20,
        provenance: DataProvenance.estimated('Test Fixture').toJSON()
      })
    ]
  });
}

async function runWeatherContextTests() {
  console.log('\n================================================================');
  console.log(' Day 16 Weather Context Integration Verification');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 1: Normal / Clear Weather
  // --------------------------------------------------------------------------
  test('Scenario 1: Normal clear weather produces 0 added road delay, no walking penalty, and low uncertainty', () => {
    const journey = createRoadJourney();
    const weatherContext = WeatherContext.clear();

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.CLEAR);
    assert.strictEqual(impact.isAffected, false, 'Clear weather does not flag journey as affected');
    assert.strictEqual(impact.isUnaffected(), true, 'isUnaffected helper returns true');
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 0, 'Zero road delay for clear weather');
    assert.strictEqual(impact.walkingInconvenience.score, 0, 'Zero walking inconvenience score');
    assert.strictEqual(impact.walkingInconvenience.level, WALKING_INCONVENIENCE_LEVELS.NONE);
    assert.strictEqual(impact.travelUncertainty.level, TRAVEL_UNCERTAINTY_LEVELS.LOW);
    assert.strictEqual(impact.travelUncertainty.recommendEarlyDepartureMinutes, 0);
    assert.strictEqual(impact.totalAddedTravelTimeMinutes, 0);
    assert.strictEqual(impact.updatedDurationMinutes, journey.totalDurationMinutes);
    assert.strictEqual(impact.isImpractical, false);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Moderate Rain
  // --------------------------------------------------------------------------
  test('Scenario 2: Moderate rain adds road delay, walking inconvenience, and moderate travel uncertainty', () => {
    const journey = createMultimodalJourney();
    const weatherContext = WeatherContext.rain({
      precipitationProbability: 75,
      advisory: 'Passing rain showers across Western Suburbs'
    });

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.RAIN);
    assert.strictEqual(impact.isAffected, true, 'Rain flags journey as affected');
    assert.strictEqual(impact.walkingInconvenience.level, WALKING_INCONVENIENCE_LEVELS.MODERATE);
    assert.strictEqual(impact.walkingInconvenience.outdoorWalkMinutes, 10, 'Detects 10 min outdoor walk');
    assert(impact.walkingInconvenience.addedWalkFatigueMinutes >= 1, 'Walk fatigue added for rain');
    assert(impact.walkingInconvenience.score > 20, 'Moderate walking inconvenience score calculated');

    // Road delay: exactly 1 road segment (auto)
    assert.strictEqual(impact.roadDelay.affectedRoadSegmentsCount, 1, '1 road segment affected');
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 4, '4 min road delay for rain');

    // Travel uncertainty
    assert.strictEqual(impact.travelUncertainty.level, TRAVEL_UNCERTAINTY_LEVELS.MODERATE);
    assert.strictEqual(impact.travelUncertainty.recommendEarlyDepartureMinutes, 5);

    // Sheltered segments identified
    assert.strictEqual(impact.shelteredSegments.length, 2, 'Identifies train and metro as sheltered');
    assert.strictEqual(impact.isImpractical, false, 'Rain never marks route impractical');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Heavy Rain
  // --------------------------------------------------------------------------
  test('Scenario 3: Heavy monsoon rain increases walking inconvenience and road delay while preserving route feasibility', () => {
    const journey = createMultimodalJourney();
    const weatherContext = WeatherContext.heavyRain({
      precipitationProbability: 95,
      advisory: 'Heavy monsoon downpour; localized waterlogging on arterial roads'
    });

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.HEAVY_RAIN);
    assert.strictEqual(impact.walkingInconvenience.level, WALKING_INCONVENIENCE_LEVELS.HIGH);
    assert(impact.walkingInconvenience.score >= 70, 'High walking inconvenience score for heavy rain');
    assert(impact.walkingInconvenience.addedWalkFatigueMinutes >= 3, 'Noticeable added walk fatigue');

    // Road delay: 10 min for the single auto segment
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 10, '10 min road delay for heavy rain');

    // Travel uncertainty & early departure
    assert.strictEqual(impact.travelUncertainty.level, TRAVEL_UNCERTAINTY_LEVELS.HIGH);
    assert.strictEqual(impact.travelUncertainty.recommendEarlyDepartureMinutes, 15);

    // Route remains viable
    assert.strictEqual(impact.isImpractical, false, 'Heavy rain does not declare route impossible');
    assert(impact.advisories.some(a => a.includes('waterlogging') || a.includes('Torrential')), 'Advisory mentions waterlogging');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Severe Storm Weather
  // --------------------------------------------------------------------------
  test('Scenario 4: Severe storm reflects high road delay and extreme uncertainty without arbitrarily declaring route impossible', () => {
    const journey = createMultimodalJourney();
    const weatherContext = WeatherContext.severe();

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.SEVERE);
    assert.strictEqual(impact.walkingInconvenience.level, WALKING_INCONVENIENCE_LEVELS.EXTREME);
    assert(impact.walkingInconvenience.score >= 90, 'Extreme walking inconvenience score');
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 18, '18 min road delay for severe storm');
    assert.strictEqual(impact.travelUncertainty.level, TRAVEL_UNCERTAINTY_LEVELS.SEVERE);
    assert.strictEqual(impact.travelUncertainty.recommendEarlyDepartureMinutes, 30);

    // Does not automatically declare route impossible
    assert.strictEqual(impact.isImpractical, false, 'Does not declare route impossible by default');

    // Supports explicit impracticality if configured
    const severeImpracticalImpact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext, {
      severeIsImpractical: true
    });
    assert.strictEqual(severeImpracticalImpact.isImpractical, true);
    assert(severeImpracticalImpact.impracticalReason !== null);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Extreme Heat Where Relevant
  // --------------------------------------------------------------------------
  test('Scenario 5: Extreme heat penalizes outdoor walking segments while road vehicular delays remain 0', () => {
    const journey = createMultimodalJourney();
    const weatherContext = WeatherContext.extremeHeat({
      temperatureC: 42,
      feelsLikeC: 48
    });

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.EXTREME_HEAT);
    assert.strictEqual(impact.walkingInconvenience.level, WALKING_INCONVENIENCE_LEVELS.HIGH);
    assert(impact.walkingInconvenience.score >= 60, 'Walking inconvenience score elevated for extreme heat');
    assert(impact.walkingInconvenience.addedWalkFatigueMinutes >= 2, 'Heat walking fatigue added');

    // Road vehicular travel is not impeded by heat
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 0, 'Zero road delay for heat');
    assert(impact.advisories.some(a => a.toLowerCase().includes('heat') || a.toLowerCase().includes('sun')), 'Includes heat advisory');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Expired Weather Context
  // --------------------------------------------------------------------------
  test('Scenario 6: Expired weather context is discarded and defaults cleanly to baseline conditions', () => {
    const journey = createRoadJourney();
    const pastTime = Date.now() - 2 * 60 * 60 * 1000;
    const expiredContext = new WeatherContext({
      condition: WEATHER_CONDITIONS.HEAVY_RAIN,
      startTime: pastTime - 60 * 60 * 1000,
      expiryTime: pastTime - 10 * 60 * 1000, // expired 10 minutes prior to pastTime
      advisory: 'Old expired warning'
    });

    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, expiredContext, {
      currentTime: pastTime
    });

    assert.strictEqual(impact.weatherCondition, WEATHER_CONDITIONS.CLEAR, 'Expired context reverts to clear');
    assert.strictEqual(impact.isAffected, false, 'Expired context produces unaffected status');
    assert.strictEqual(impact.roadDelay.estimatedDelayMinutes, 0);
    assert.strictEqual(impact.walkingInconvenience.score, 0);
    assert.strictEqual(impact.totalAddedTravelTimeMinutes, 0);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Provenance Propagation (All 4 Tiers)
  // --------------------------------------------------------------------------
  test('Scenario 7: Accurately preserves and propagates VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC tiers', () => {
    const conditions = weatherContextService.seedPrototypeWeatherConditions();
    assert.strictEqual(conditions.length, 4, 'Seeds 4 realistic prototype weather conditions');

    const verifiedCond = conditions.find(c => c.provenance.sourceTier === PROVENANCE_TIERS.VERIFIED);
    const userCond = conditions.find(c => c.provenance.sourceTier === PROVENANCE_TIERS.USER_REPORTED);
    const estCond = conditions.find(c => c.provenance.sourceTier === PROVENANCE_TIERS.ESTIMATED);
    const synthCond = conditions.find(c => c.provenance.sourceTier === PROVENANCE_TIERS.SYNTHETIC);

    assert(verifiedCond !== undefined, 'Found VERIFIED IMD bulletin');
    assert(userCond !== undefined, 'Found USER_REPORTED commuter feed');
    assert(estCond !== undefined, 'Found ESTIMATED radar nowcast');
    assert(synthCond !== undefined, 'Found SYNTHETIC simulation model');

    const journey = createRoadJourney();

    // Verify propagation for VERIFIED
    const verifiedCtx = WeatherContext.heavyRain({
      provenance: verifiedCond.provenance.toJSON()
    });
    const verifiedImpact = weatherContextService.evaluateJourneyWeatherImpact(journey, verifiedCtx);
    assert.strictEqual(verifiedImpact.hasVerifiedData(), true, 'Propagates VERIFIED tier');

    // Verify propagation for USER_REPORTED
    const userCtx = WeatherContext.rain({
      provenance: userCond.provenance.toJSON()
    });
    const userImpact = weatherContextService.evaluateJourneyWeatherImpact(journey, userCtx);
    assert.strictEqual(userImpact.hasUserReportedData(), true, 'Propagates USER_REPORTED tier');

    // Verify propagation for ESTIMATED
    const estCtx = WeatherContext.rain({
      provenance: estCond.provenance.toJSON()
    });
    const estImpact = weatherContextService.evaluateJourneyWeatherImpact(journey, estCtx);
    assert.strictEqual(estImpact.hasEstimatedData(), true, 'Propagates ESTIMATED tier');

    // Verify propagation for SYNTHETIC
    const synthCtx = WeatherContext.severe({
      provenance: synthCond.provenance.toJSON()
    });
    const synthImpact = weatherContextService.evaluateJourneyWeatherImpact(journey, synthCtx);
    assert.strictEqual(synthImpact.hasSyntheticData(), true, 'Propagates SYNTHETIC tier');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Journey Weather Impact Application & Recalculation
  // --------------------------------------------------------------------------
  test('Scenario 8: applyWeatherImpactToJourney attaches impact and updates duration and arrival time', () => {
    const journey = createMultimodalJourney();
    const initialDuration = journey.totalDurationMinutes;
    const initialArrival = journey.estimatedArrivalTime;

    const weatherContext = WeatherContext.rain();
    const impact = weatherContextService.evaluateJourneyWeatherImpact(journey, weatherContext);

    assert(impact.totalAddedTravelTimeMinutes > 0, 'Added travel time computed');
    const updatedJourney = weatherContextService.applyWeatherImpactToJourney(journey, impact);

    assert(updatedJourney.weatherImpact !== undefined, 'weatherImpact attached to journey');
    assert.strictEqual(updatedJourney.totalDurationMinutes, initialDuration + impact.totalAddedTravelTimeMinutes);
    assert.notStrictEqual(updatedJourney.estimatedArrivalTime, initialArrival, 'Arrival time updated for delay');
    assert.strictEqual(updatedJourney.isViable, true, 'Route remains viable');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: CommuteContextService Integration
  // --------------------------------------------------------------------------
  await asyncTest('Scenario 9: CommuteContextService enriches Stage 1 context with normalized weatherContext', async () => {
    const mockPlanInput = {
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      desiredArrivalTime: '08:45',
      preferredModes: ['auto', 'train']
    };

    const context = await commuteContextService.collectContext(mockPlanInput);

    assert(context.weatherContext !== undefined, 'weatherContext is present in context');
    assert(typeof context.weatherContext.condition === 'string', 'weatherContext has condition string');
    assert(typeof context.weatherContext.temperatureC === 'number', 'weatherContext has temperatureC number');
    assert(typeof context.weatherContext.advisory === 'string', 'weatherContext has advisory string');
    assert(typeof context.weatherContext.walkingInconvenienceLevel === 'string', 'weatherContext has walkingInconvenienceLevel');
    assert(typeof context.weatherContext.roadDelayMinutes === 'number', 'weatherContext has roadDelayMinutes');
    assert(typeof context.weatherContext.travelUncertaintyLevel === 'string', 'weatherContext has travelUncertaintyLevel');
    assert(context.weatherContext.provenance !== undefined, 'weatherContext has provenance');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWeatherContextTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
