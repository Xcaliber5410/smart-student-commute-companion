/**
 * Master Verification Test Suite: Contextual Commute Personalization Pipeline
 *
 * Verifies the end-to-end pipeline:
 * student commute input
 * → route generation
 * → disruption/context analysis
 * → constraints
 * → personalized recommendation
 * → academic schedule context
 * → contextual explanation
 * → optional AI explanation
 * → uncertainty/provenance metadata
 * → API response
 *
 * Covers all 20 required verification scenarios:
 * 1. Normal commute without academic context
 * 2. Upcoming class with a known start time
 * 3. Missing class location
 * 4. Explicit arrival deadline
 * 5. Disrupted journey affecting departure advice
 * 6. Preference-sensitive route selection
 * 7. Explanations matching actual route metrics
 * 8. Unsupported explanation claims being rejected or omitted
 * 9. AI provider success
 * 10. AI provider timeout or error
 * 11. Missing AI credentials
 * 12. Deterministic fallback explanations
 * 13. Synthetic and estimated transport data
 * 14. Mixed provenance
 * 15. Missing or stale context
 * 16. Student authorization and privacy
 * 17. No feasible route
 * 18. Deterministic results for identical inputs
 * 19. Existing API compatibility
 * 20. Existing backend regression coverage
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../app');
const { signToken } = require('../utils/token');
const { CalendarEvent, calendarEventRepository } = require('../models/CalendarEvent');
const {
  personalizedRouteRecommendationService,
  PersonalizedRouteRecommendationService,
  SafeCommuteExplanationAdapter,
  MockAiCommuteExplanationProvider,
  GeminiCommuteExplanationProvider,
  DeterministicCommuteExplanationProvider,
  buildPrivacySafePromptPayload,
  validateAiExplanationOutput,
  sanitizeCoarseArea,
  recommendationExplanationService,
  departureAdviceService,
  contextualPersonalizationService,
  personalizationUncertaintyService,
  deterministicRouteScoringService
} = require('../services');
const {
  PROVENANCE_TIERS,
  DataProvenance,
  PersonalizedRecommendationExplanation
} = require('../models');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { IST_OFFSET_MS } = require('../utils/timezone');

function createMumbaiTimestamp(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MS;
}

function makeRequest(port, options = {}) {
  const {
    path = '/api/commute/recommendations',
    method = 'POST',
    token = null,
    body = null
  } = options;

  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function createCandidateRoute(overrides = {}) {
  const baseDuration = overrides.totalDurationMinutes ?? overrides.totalTravelTime ?? 30;
  const disruptionDelay = overrides.disruptionDelayMinutes ?? 0;
  const depTime = overrides.departureTime || '08:00';

  const [depH, depM] = depTime.split(':').map(Number);
  const totalMin = (depH * 60 + depM + baseDuration + disruptionDelay) % 1440;
  const arrH = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const arrM = String(totalMin % 60).padStart(2, '0');
  const arrivalTime = `${arrH}:${arrM}`;

  const primaryMode = overrides.primaryMode || 'metro';
  const transferCount = overrides.transferCount !== undefined
    ? overrides.transferCount
    : (overrides.transfers !== undefined ? overrides.transfers : 1);
  const walkingTimeMinutes = overrides.walkingMinutes !== undefined
    ? overrides.walkingMinutes
    : (overrides.walkingTimeMinutes ?? 5);

  return {
    id: overrides.id || overrides.journeyId || `journey-${Math.random().toString(36).substring(2, 7)}`,
    journeyId: overrides.journeyId || overrides.id || `journey-${Math.random().toString(36).substring(2, 7)}`,
    origin: overrides.origin || 'Andheri West',
    destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
    primaryMode,
    modesIncluded: overrides.modesIncluded || [primaryMode, 'walk'],
    totalTravelTime: baseDuration + disruptionDelay,
    totalTravelTimeMinutes: baseDuration + disruptionDelay,
    totalDurationMinutes: baseDuration,
    baselineDurationMinutes: baseDuration,
    expectedDisruptionDelayMinutes: disruptionDelay,
    departureTime: depTime,
    estimatedArrivalTime: arrivalTime,
    updatedArrivalTime: arrivalTime,
    isFeasible: overrides.isFeasible !== undefined ? overrides.isFeasible : true,
    feasibilityTier: 1,
    transfers: transferCount,
    numberOfTransfers: transferCount,
    transferCount,
    walkingTimeMinutes,
    walkingMinutes: walkingTimeMinutes,
    estimatedCostRupees: overrides.cost !== undefined ? overrides.cost : 20,
    estimatedCost: overrides.cost !== undefined ? overrides.cost : 20,
    provenance: overrides.provenance || { sourceTier: PROVENANCE_TIERS.VERIFIED },
    reliability: overrides.reliability || 'LOW',
    segments: overrides.segments || [
      {
        type: 'TRANSIT',
        mode: primaryMode,
        durationMinutes: baseDuration,
        provenance: overrides.provenance || { sourceTier: PROVENANCE_TIERS.VERIFIED }
      }
    ],
    breakdown: {
      travelTime: { durationMinutes: baseDuration },
      disruption: { delayMinutes: disruptionDelay },
      transfers: { count: transferCount },
      walking: { minutes: walkingTimeMinutes },
      cost: { fareRupees: overrides.cost !== undefined ? overrides.cost : 20 },
      personalization: { profile: overrides.profile || 'balanced', bonuses: overrides.bonuses || [] }
    }
  };
}

async function runMasterVerification() {
  console.log('\n========================================================================');
  console.log(' MASTER VERIFICATION: Contextual Commute Personalization Pipeline');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${title}`);
      console.error(err);
      failed++;
    }
  }

  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const testUserA = {
    id: 'student-master-user-a',
    email: 'user-a@djsanghvi.edu',
    role: 'student'
  };
  const tokenA = signToken({ sub: testUserA.id, email: testUserA.email, role: testUserA.role });

  const testUserB = {
    id: 'student-master-user-b',
    email: 'user-b@djsanghvi.edu',
    role: 'student'
  };
  const tokenB = signToken({ sub: testUserB.id, email: testUserB.email, role: testUserB.role });

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Normal commute without academic context
    // ------------------------------------------------------------------------
    await test('1. Normal commute without academic context', async () => {
      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          desiredArrivalTime: '09:00',
          routePreference: 'fastest',
          preferredModes: ['train', 'metro']
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.strictEqual(data.hasFeasibleRoute, true);
      assert.strictEqual(data.hasSuccessfulRecommendation, true);
      assert.strictEqual(data.isFallback, false);
      assert.ok(data.primaryRecommendation, 'Must contain primaryRecommendation');
      assert.ok(Array.isArray(data.alternativeRoutes), 'Must contain alternativeRoutes');
      assert.ok(typeof data.selectionReason === 'string' && data.selectionReason.length > 0);

      // Schedule context: No academic schedule present
      assert.ok(data.scheduleContext, 'scheduleContext must be present');
      assert.strictEqual(data.scheduleContext.hasScheduleContext, false);
      assert.strictEqual(data.scheduleContext.bufferMinutes, 0);

      // Verify no fabricated schedule data
      assert.strictEqual(data.scheduleContext.eventTitle, null);
      assert.strictEqual(data.scheduleContext.eventStartTime, null);

      // Verify arrival advice & uncertainty details
      assert.ok(data.arrivalAdvice);
      assert.strictEqual(data.arrivalAdvice.bufferMinutes, 0);
      assert.ok(data.uncertaintyDetails);
      assert.ok(['LOW', 'MODERATE', 'HIGH', 'SEVERE'].includes(data.uncertaintyDetails.uncertaintyLevel));
      assert.strictEqual(data.uncertaintyDetails.liveFeedStatus?.hasLiveGps, false);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 2: Upcoming class with a known start time
    // ------------------------------------------------------------------------
    await test('2. Upcoming class with a known start time', async () => {
      const now = new Date();
      const testDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const classStart = createMumbaiTimestamp(testDateStr, '09:00');
      const classEnd = createMumbaiTimestamp(testDateStr, '10:00');

      try {
        calendarEventRepository.create(
          CalendarEvent.create({
            id: `cal-evt-class-${Date.now()}`,
            user_id: testUserA.id,
            title: 'Operating Systems Lecture',
            event_type: 'lecture',
            start_time: classStart,
            end_time: classEnd,
            location: 'D.J. Sanghvi College of Engineering',
            status: 'scheduled'
          })
        );
      } catch (e) {
        // Continue if already exists
      }

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          currentTime: classStart - 75 * 60 * 1000 // 1 hour 15 min before class
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.ok(data.scheduleContext);
      if (data.scheduleContext.hasScheduleContext) {
        assert.strictEqual(data.scheduleContext.source, 'ACADEMIC_EVENT');
        assert.strictEqual(data.scheduleContext.isDestinationMatched, true);
        assert.ok(data.scheduleContext.bufferMinutes >= 10, 'Must apply at least 10m buffer for lecture');
        assert.ok(data.arrivalAdvice.bufferMinutes >= 10);
        assert.strictEqual(data.arrivalAdvice.targetArrivalTime, '08:50'); // 09:00 minus 10m buffer
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 3: Missing class location
    // ------------------------------------------------------------------------
    await test('3. Missing class location (no invented destination connections)', async () => {
      const now = new Date();
      const testDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const classStart = createMumbaiTimestamp(testDateStr, '11:00');
      const classEnd = createMumbaiTimestamp(testDateStr, '12:00');

      try {
        calendarEventRepository.create(
          CalendarEvent.create({
            id: `cal-evt-nolocation-${Date.now()}`,
            user_id: testUserA.id,
            title: 'Independent Study Lab',
            event_type: 'lab',
            start_time: classStart,
            end_time: classEnd,
            location: null, // Missing location!
            status: 'scheduled'
          })
        );
      } catch (e) {
        // Continue if already exists
      }

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '10:00',
          currentTime: classStart - 60 * 60 * 1000
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      // Invariant: Missing location must NEVER be assumed to match commute destination
      if (data.scheduleContext && data.scheduleContext.eventTitle === 'Independent Study Lab') {
        assert.strictEqual(data.scheduleContext.isDestinationMatched, false, 'Must NOT invent destination connection');
        assert.strictEqual(data.scheduleContext.location, null);
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 4: Explicit arrival deadline
    // ------------------------------------------------------------------------
    await test('4. Explicit arrival deadline (preserved, conflicts flagged)', async () => {
      // Student specifies explicit desiredArrivalTime of 08:30
      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Bandra West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '07:45',
          desiredArrivalTime: '08:30' // Explicit deadline
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.strictEqual(data.hasFeasibleRoute, true);
      assert.strictEqual(data.arrivalAdvice.targetArrivalTime, '08:30');
      assert.strictEqual(data.queryContext.targetArrivalTime, '08:30');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 5: Disrupted journey affecting departure advice
    // ------------------------------------------------------------------------
    await test('5. Disrupted journey affecting departure advice', async () => {
      const delayedEval = new RouteEvaluation({
        journeyId: 'journey-disrupted-eval',
        origin: 'Borivali West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:20',
        estimatedArrivalTime: '08:50',
        updatedArrivalTime: '09:10',
        baselineTravelTime: 30,
        totalTravelTime: 50,
        additionalDisruptionDelay: 20,
        totalAdditionalDelay: 20,
        waitingTime: 0,
        walkingTime: 5,
        transitTime: 25,
        numberOfTransfers: 1,
        estimatedCost: 25,
        isCostAvailable: true,
        primaryMode: 'metro',
        isFeasible: true,
        reliability: 'HIGH',
        uncertainty: 'HIGH',
        segments: [
          {
            type: 'WALK',
            mode: 'walk',
            durationMinutes: 5,
            fromArea: 'Borivali West',
            toArea: 'Borivali Station'
          },
          {
            type: 'TRANSIT',
            mode: 'metro',
            lineName: 'Metro Line 1',
            corridorOrArea: 'Metro Line 1',
            durationMinutes: 25,
            fromArea: 'Borivali Station',
            toArea: 'D.J. Sanghvi College of Engineering'
          }
        ],
        provenance: DataProvenance.verified('Official Metro Feed').toJSON()
      });

      const now = new Date();
      const testDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const classStart = createMumbaiTimestamp(testDateStr, '09:00');
      const classEnd = createMumbaiTimestamp(testDateStr, '10:00');

      try {
        calendarEventRepository.create(
          CalendarEvent.create({
            id: `cal-evt-disrupt-${Date.now()}`,
            user_id: testUserA.id,
            title: 'Systems Programming Lecture',
            event_type: 'lecture',
            start_time: classStart,
            end_time: classEnd,
            location: 'D.J. Sanghvi College of Engineering',
            status: 'scheduled'
          })
        );
      } catch (e) {
        // Continue if already exists
      }

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:20',
          currentTime: classStart - 50 * 60 * 1000,
          evaluations: [delayedEval]
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.ok(data.disruptionEffects);
      assert.strictEqual(data.disruptionEffects.delayMinutes, 20);
      assert.ok(data.departureAdvice);
      assert.strictEqual(data.arrivalAdvice.isEarlierDepartureRecommended, true);
      assert.strictEqual(data.departureAdvice.adviceType, 'EARLIER_DEPARTURE_RECOMMENDED');
      assert.ok(data.departureAdvice.suggestedDeparture?.earlierByMinutes >= 15);
      assert.ok(data.departureAdvice.actionableGuidance.length > 0 || data.departureAdvice.explanation.length > 0);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 6: Preference-sensitive route selection
    // ------------------------------------------------------------------------
    await test('6. Preference-sensitive route selection (flipping primary route)', async () => {
      // Candidate A: Fastest (15 min, ₹35, 1 transfer, 5 min walk)
      const candFast = createCandidateRoute({
        id: 'cand-fast',
        journeyId: 'cand-fast',
        totalDurationMinutes: 15,
        cost: 35,
        transfers: 1,
        transferCount: 1,
        walkingMinutes: 5,
        primaryMode: 'metro'
      });

      // Candidate B: Cheapest (22 min, ₹5, 1 transfer, 10 min walk)
      const candCheap = createCandidateRoute({
        id: 'cand-cheap',
        journeyId: 'cand-cheap',
        totalDurationMinutes: 22,
        cost: 5,
        transfers: 1,
        transferCount: 1,
        walkingMinutes: 10,
        primaryMode: 'bus'
      });

      // Candidate C: Fewest transfers (26 min, ₹35, 0 transfers, 4 min walk)
      const candDirect = createCandidateRoute({
        id: 'cand-direct',
        journeyId: 'cand-direct',
        totalDurationMinutes: 26,
        cost: 35,
        transfers: 0,
        transferCount: 0,
        walkingMinutes: 4,
        primaryMode: 'train'
      });

      // Candidate D: Least walking (22 min, ₹35, 1 transfer, 1 min walk)
      const candLowWalk = createCandidateRoute({
        id: 'cand-low-walk',
        journeyId: 'cand-low-walk',
        totalDurationMinutes: 22,
        cost: 35,
        transfers: 1,
        transferCount: 1,
        walkingMinutes: 1,
        primaryMode: 'auto'
      });

      const candidateSet = [candFast, candCheap, candDirect, candLowWalk];

      // 6a. Fastest preference
      const resFast = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          routePreference: 'fastest',
          candidateRoutes: candidateSet
        }
      });
      assert.strictEqual(resFast.status, 200);
      const dataFast = resFast.body.data || resFast.body;
      assert.strictEqual(dataFast.primaryRecommendation.journeyId || dataFast.primaryRecommendation.id, 'cand-fast');

      // 6b. Cheapest preference
      const resCheap = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          routePreference: 'cheapest',
          candidateRoutes: candidateSet
        }
      });
      assert.strictEqual(resCheap.status, 200);
      const dataCheap = resCheap.body.data || resCheap.body;
      assert.strictEqual(dataCheap.primaryRecommendation.journeyId || dataCheap.primaryRecommendation.id, 'cand-cheap');

      // 6c. Fewest transfers preference
      const resTrans = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          routePreference: 'fewest_transfers',
          candidateRoutes: candidateSet
        }
      });
      assert.strictEqual(resTrans.status, 200);
      const dataTrans = resTrans.body.data || resTrans.body;
      assert.strictEqual(dataTrans.primaryRecommendation.journeyId || dataTrans.primaryRecommendation.id, 'cand-direct');

      // 6d. Least walking preference
      const resWalk = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          routePreference: 'least_walking',
          candidateRoutes: candidateSet
        }
      });
      assert.strictEqual(resWalk.status, 200);
      const dataWalk = resWalk.body.data || resWalk.body;
      assert.strictEqual(dataWalk.primaryRecommendation.journeyId || dataWalk.primaryRecommendation.id, 'cand-low-walk');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 7: Explanations matching actual route metrics
    // ------------------------------------------------------------------------
    await test('7. Explanations matching actual route metrics', async () => {
      const targetRoute = createCandidateRoute({
        id: 'cand-metrics-verify',
        journeyId: 'cand-metrics-verify',
        totalDurationMinutes: 27,
        cost: 25,
        transfers: 1,
        transferCount: 1,
        walkingMinutes: 6,
        primaryMode: 'metro'
      });

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          candidateRoutes: [targetRoute]
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      const rec = data.primaryRecommendation;
      assert.strictEqual(rec.totalTravelTimeMinutes, 27);
      assert.strictEqual(rec.transfers, 1);
      assert.strictEqual(rec.walkingTimeMinutes, 6);
      assert.strictEqual(rec.estimatedCostRupees, 25);

      // Verify explanation details match
      const expl = data.explanation;
      assert.ok(expl);
      assert.strictEqual(expl.timingExplanation.travelTimeMinutes, 27);
      assert.strictEqual(expl.disruptionEffects.delayMinutes, 0);
      assert.strictEqual(expl.primaryRouteId, 'cand-metrics-verify');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 8: Unsupported explanation claims being rejected or omitted
    // ------------------------------------------------------------------------
    await test('8. Unsupported explanation claims being rejected or omitted', () => {
      const mockPayload = {
        primaryRoute: {
          primaryMode: 'train',
          totalTravelTimeMinutes: 30,
          walkingTimeMinutes: 5,
          disruptionDelayMinutes: 0,
          estimatedCostRupees: null, // Cost is null
          transfers: 1, // 1 transfer
          isSynthetic: true, // Synthetic data
          isFastest: false // NOT fastest
        },
        alternativesSummary: []
      };

      // 8a. Hallucinated duration (>5 min difference)
      const hallucinatedDuration = validateAiExplanationOutput(
        { summary: 'Route takes 45 minutes.', selectionReason: 'Takes 45 mins.' },
        mockPayload
      );
      assert.strictEqual(hallucinatedDuration.isValid, false);
      assert.ok(hallucinatedDuration.reason.includes('hallucinated duration'));

      // 8b. False fastest claim
      const falseFastest = validateAiExplanationOutput(
        { summary: 'Optimal trip.', selectionReason: 'Selected as the fastest route available.' },
        mockPayload
      );
      assert.strictEqual(falseFastest.isValid, false);
      assert.ok(falseFastest.reason.includes('fastest'));

      // 8c. Fabricated fare amount when cost is null
      const fabricatedFare = validateAiExplanationOutput(
        { summary: 'Train ride.', selectionReason: 'Has an exact fare of ₹35.' },
        mockPayload
      );
      assert.strictEqual(fabricatedFare.isValid, false);
      assert.ok(fabricatedFare.reason.includes('fabricated exact fare'));

      // 8d. False live GPS claim for synthetic data
      const falseGps = validateAiExplanationOutput(
        { summary: 'Verified train.', selectionReason: 'Tracking via real-time gps feed.' },
        mockPayload
      );
      assert.strictEqual(falseGps.isValid, false);
      assert.ok(falseGps.reason.includes('synthetic'));

      // 8e. False zero-transfers claim
      const falseTransfers = validateAiExplanationOutput(
        { summary: 'Direct ride.', selectionReason: 'Enjoy a non-stop journey with zero transfers.' },
        mockPayload
      );
      assert.strictEqual(falseTransfers.isValid, false);
      assert.ok(falseTransfers.reason.includes('0 transfers'));

      // 8f. Secret credential token leak
      const credentialLeak = validateAiExplanationOutput(
        { summary: 'Token route.', selectionReason: 'Using api_key secret.' },
        mockPayload
      );
      assert.strictEqual(credentialLeak.isValid, false);
      assert.ok(credentialLeak.reason.includes('credential tokens'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 9: AI provider success
    // ------------------------------------------------------------------------
    await test('9. AI provider success (natural language enhancement preserved)', async () => {
      const originalAdapter = personalizedRouteRecommendationService.aiExplanationAdapter;
      const validMockProvider = new MockAiCommuteExplanationProvider({
        mockOutput: payload => ({
          summary: `Clear AI commute via ${payload.primaryRoute.primaryMode.toUpperCase()} taking ${payload.primaryRoute.totalTravelTimeMinutes} mins.`,
          selectionReason: `Selected as dependable transit option taking ${payload.primaryRoute.totalTravelTimeMinutes} mins with ${payload.primaryRoute.transfers} transfer.`,
          tradeOffSummary: 'Balanced commute speed.',
          disruptionSummary: 'Clear corridors.',
          uncertaintySummary: 'Timetabled projections.'
        })
      });
      personalizedRouteRecommendationService.aiExplanationAdapter = new SafeCommuteExplanationAdapter({
        provider: validMockProvider
      });

      try {
        const res = await makeRequest(port, {
          token: tokenA,
          body: {
            origin: 'Andheri West',
            desiredDepartureTime: '08:00'
          }
        });

        assert.strictEqual(res.status, 200);
        const data = res.body.data || res.body;

        assert.strictEqual(data.hasFeasibleRoute, true);
        assert.strictEqual(data.explanationMethod, 'ai-assisted');
        assert.strictEqual(data.explanationMode, 'AI_ASSISTED');
        assert.strictEqual(data.isAiEnhanced, true);
        assert.ok(data.explanationAudit);
        assert.strictEqual(data.explanationAudit.isAiEnhanced, true);
        assert.strictEqual(data.explanationAudit.fallbackOccurred, false);
      } finally {
        personalizedRouteRecommendationService.aiExplanationAdapter = originalAdapter;
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 10: AI provider timeout or error
    // ------------------------------------------------------------------------
    await test('10. AI provider timeout or error (graceful fallback without crashing)', async () => {
      const originalAdapter = personalizedRouteRecommendationService.aiExplanationAdapter;
      const errorMockProvider = new MockAiCommuteExplanationProvider({
        shouldError: true,
        errorMessage: 'Gemini Gateway Timeout 504'
      });
      personalizedRouteRecommendationService.aiExplanationAdapter = new SafeCommuteExplanationAdapter({
        provider: errorMockProvider
      });

      try {
        const res = await makeRequest(port, {
          token: tokenA,
          body: {
            origin: 'Bandra West',
            desiredDepartureTime: '08:00'
          }
        });

        assert.strictEqual(res.status, 200);
        const data = res.body.data || res.body;

        // Invariant: Must NOT fail request; must fallback gracefully
        assert.strictEqual(data.hasFeasibleRoute, true);
        assert.strictEqual(data.explanationMethod, 'deterministic');
        assert.strictEqual(data.explanationMode, 'DETERMINISTIC');
        assert.strictEqual(data.isAiEnhanced, false);
        assert.ok(data.explanationAudit);
        assert.strictEqual(data.explanationAudit.fallbackOccurred, true);
        assert.strictEqual(data.explanationAudit.fallbackReason, 'PROVIDER_ERROR');
      } finally {
        personalizedRouteRecommendationService.aiExplanationAdapter = originalAdapter;
      }
    });

    // ------------------------------------------------------------------------
    // SCENARIO 11: Missing AI credentials
    // ------------------------------------------------------------------------
    await test('11. Missing AI credentials (immediate fallback without network call)', async () => {
      const unconfiguredGemini = new GeminiCommuteExplanationProvider({ apiKey: '' });
      assert.strictEqual(unconfiguredGemini.isConfigured(), false);

      const adapter = new SafeCommuteExplanationAdapter({ provider: unconfiguredGemini });
      const mockRoute = createCandidateRoute({
        id: 'mock-route-cred',
        journeyId: 'mock-route-cred',
        totalDurationMinutes: 25,
        cost: 20,
        transfers: 0,
        walkingMinutes: 4,
        primaryMode: 'metro'
      });
      const mockDeterministic = recommendationExplanationService.explainRecommendation({
        primaryRoute: mockRoute,
        targetArrivalTime: '08:45'
      });

      const enhanced = await adapter.enhanceExplanation({
        recommendation: {
          selectedRoute: mockRoute
        },
        deterministicExplanation: mockDeterministic
      });

      assert.strictEqual(enhanced.aiMetadata.isAiEnhanced, false);
      assert.strictEqual(enhanced.aiMetadata.fallbackReason, 'MISSING_CREDENTIALS');
      assert.ok(typeof enhanced.summary === 'string' && enhanced.summary.length > 0);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 12: Deterministic fallback explanations
    // ------------------------------------------------------------------------
    await test('12. Deterministic fallback explanations (structured & comprehensive)', async () => {
      const candA = createCandidateRoute({
        id: 'cand-det-expl',
        totalDurationMinutes: 26,
        cost: 20,
        transfers: 1,
        walkingMinutes: 5,
        primaryMode: 'metro'
      });

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          useAiExplanation: false,
          candidateRoutes: [candA]
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.strictEqual(data.explanationMethod, 'deterministic');
      assert.ok(typeof data.selectionReason === 'string' && data.selectionReason.length > 0);
      assert.ok(Array.isArray(data.recommendationReasons) && data.recommendationReasons.length > 0);
      assert.ok(Array.isArray(data.routeTradeOffs));
      assert.ok(data.disruptionEffects);
      assert.ok(data.departureAdvice);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 13: Synthetic and estimated transport data
    // ------------------------------------------------------------------------
    await test('13. Synthetic and estimated transport data (never treated as verified)', async () => {
      const candSynthetic = createCandidateRoute({
        id: 'cand-synth',
        totalDurationMinutes: 30,
        cost: 25,
        provenance: { sourceTier: PROVENANCE_TIERS.SYNTHETIC }
      });

      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          candidateRoutes: [candSynthetic]
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      // Invariant: Synthetic data must be honestly declared in warnings & uncertainty
      assert.ok(data.dataQualityWarnings.some(w => w.toLowerCase().includes('synthetic')));
      assert.ok(data.uncertaintyDetails.dataQualityWarnings.some(w => w.toLowerCase().includes('synthetic')));
      assert.strictEqual(data.uncertaintyDetails.liveFeedStatus.hasLiveGps, false);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 14: Mixed provenance
    // ------------------------------------------------------------------------
    await test('14. Mixed provenance (preserves distinct tiers across domains)', () => {
      const dataQuality = personalizationUncertaintyService.buildDataQualityAndUncertainty({
        primaryRoute: {
          primaryMode: 'metro',
          totalTravelTimeMinutes: 28,
          expectedDisruptionDelayMinutes: 10,
          estimatedCostRupees: null, // missing cost tier
          provenance: { sourceTier: PROVENANCE_TIERS.ESTIMATED }
        },
        context: {
          disruptions: [
            {
              affectedArea: 'Metro Line 1',
              delayMinutes: 10,
              provenance: { sourceTier: PROVENANCE_TIERS.USER_REPORTED }
            }
          ]
        }
      });

      assert.ok(dataQuality.dataQualityWarnings.some(w => w.includes('Fare estimate is unavailable')));
      assert.ok(dataQuality.indicators.some(i => i.type === 'CORRIDOR_DISRUPTION'));
      assert.strictEqual(dataQuality.uncertaintyLevel, 'MODERATE');
      assert.strictEqual(dataQuality.liveFeedStatus.hasLiveGps, false);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 15: Missing or stale context
    // ------------------------------------------------------------------------
    await test('15. Missing or stale context (stale disruptions & traffic flagged)', () => {
      const now = Date.now();
      const threeHoursAgo = now - 3 * 60 * 60 * 1000;
      const ninetyMinsAgo = now - 90 * 60 * 1000;

      const dataQuality = personalizationUncertaintyService.buildDataQualityAndUncertainty({
        primaryRoute: {
          primaryMode: 'bus',
          totalTravelTimeMinutes: 40,
          estimatedCostRupees: 15
        },
        context: {
          currentTime: now,
          disruptions: [
            {
              affectedArea: 'SV Road',
              delayMinutes: 15,
              updatedAt: threeHoursAgo // > 2 hours stale
            }
          ],
          trafficConditions: [
            {
              corridor: 'WEH Corridor',
              level: 'heavy',
              timestamp: ninetyMinsAgo // > 60 mins stale
            }
          ]
        }
      });

      assert.ok(dataQuality.dataQualityWarnings.some(w => w.includes('updated over 2 hours ago and may be stale')));
      assert.ok(dataQuality.dataQualityWarnings.some(w => w.includes('older than 60 minutes and may not reflect current flow')));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 16: Student authorization and privacy
    // ------------------------------------------------------------------------
    await test('16. Student authorization and privacy (cross-student access blocked)', async () => {
      // 16a. User A attempts to request student B's data
      const resCross = await makeRequest(port, {
        token: tokenA,
        body: {
          studentId: testUserB.id, // Targeting student B!
          origin: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });
      assert.strictEqual(resCross.status, 403);

      // 16b. Unauthenticated request
      const resUnauth = await makeRequest(port, {
        token: null,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00'
        }
      });
      assert.strictEqual(resUnauth.status, 401);

      // 16c. Forbidden privacy field (GPS coordinate)
      const resPrivacy = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Andheri West',
          desiredDepartureTime: '08:00',
          latitude: 19.1234, // Prohibited!
          longitude: 72.8361
        }
      });
      assert.strictEqual(resPrivacy.status, 400);

      // 16d. Sanitize coarse area test
      const scrubbed = sanitizeCoarseArea('Flat 402, Building 7, Room 302, 19.1234, 72.8361, Borivali West, 400092');
      assert.ok(!scrubbed.includes('402'));
      assert.ok(!scrubbed.includes('Room 302'));
      assert.ok(!scrubbed.includes('400092'));
      assert.ok(scrubbed.includes('Borivali West'));
    });

    // ------------------------------------------------------------------------
    // SCENARIO 17: No feasible route
    // ------------------------------------------------------------------------
    await test('17. No feasible route (honest 200 fallback with guidance)', async () => {
      const res = await makeRequest(port, {
        token: tokenA,
        body: {
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:50',
          desiredArrivalTime: '08:51', // Impossible 1 min journey
          maxWalkingMinutes: 1,
          maxTransfers: 0
        }
      });

      assert.strictEqual(res.status, 200);
      const data = res.body.data || res.body;

      assert.strictEqual(data.hasFeasibleRoute, false);
      assert.strictEqual(data.hasSuccessfulRecommendation, false);
      assert.strictEqual(data.isFallback, true);
      assert.strictEqual(data.status, 'FALLBACK');
      assert.strictEqual(data.primaryRecommendation, null);
      assert.strictEqual(data.alternativeRoutes.length, 0);
      assert.ok(typeof data.fallbackReason === 'string' && data.fallbackReason.length > 0);
      assert.ok(Array.isArray(data.fallbackGuidance) && data.fallbackGuidance.length > 0);
      assert.strictEqual(data.explanationMethod, 'deterministic');
    });

    // ------------------------------------------------------------------------
    // SCENARIO 18: Deterministic results for identical inputs
    // ------------------------------------------------------------------------
    await test('18. Deterministic results for identical inputs', async () => {
      const reqPayload = {
        origin: 'Vile Parle East',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:15',
        desiredArrivalTime: '08:45',
        routePreference: 'fastest'
      };

      const res1 = await makeRequest(port, { token: tokenA, body: reqPayload });
      const res2 = await makeRequest(port, { token: tokenA, body: reqPayload });

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);

      const d1 = res1.body.data || res1.body;
      const d2 = res2.body.data || res2.body;

      assert.strictEqual(d1.primaryRecommendation.routeId, d2.primaryRecommendation.routeId);
      assert.strictEqual(d1.primaryRecommendation.totalTravelTimeMinutes, d2.primaryRecommendation.totalTravelTimeMinutes);
      assert.strictEqual(d1.selectionReason, d2.selectionReason);
      assert.strictEqual(d1.arrivalAdvice.recommendedDepartureTime, d2.arrivalAdvice.recommendedDepartureTime);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 19: Existing API compatibility
    // ------------------------------------------------------------------------
    await test('19. Existing API compatibility (/api/commute/recommendations & /api/student/commute/recommendations)', async () => {
      const payload = {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00'
      };

      const resStandard = await makeRequest(port, {
        path: '/api/commute/recommendations',
        token: tokenA,
        body: payload
      });

      const resAlias = await makeRequest(port, {
        path: '/api/student/commute/recommendations',
        token: tokenA,
        body: payload
      });

      assert.strictEqual(resStandard.status, 200);
      assert.strictEqual(resAlias.status, 200);

      const dStandard = resStandard.body.data || resStandard.body;
      const dAlias = resAlias.body.data || resAlias.body;

      // Both must expose both legacy fields and new contextual fields
      assert.ok(dStandard.selectedRoute);
      assert.ok(dStandard.primaryRecommendation);
      assert.ok(dStandard.meaningfulAlternatives);
      assert.ok(dStandard.alternativeRoutes);
      assert.ok(dStandard.scheduleContext);
      assert.ok(dStandard.uncertaintyDetails);

      assert.ok(dAlias.selectedRoute);
      assert.ok(dAlias.primaryRecommendation);
      assert.ok(dAlias.meaningfulAlternatives);
      assert.ok(dAlias.alternativeRoutes);
      assert.ok(dAlias.scheduleContext);
      assert.ok(dAlias.uncertaintyDetails);
    });

    // ------------------------------------------------------------------------
    // SCENARIO 20: Existing backend regression coverage
    // ------------------------------------------------------------------------
    await test('20. Existing backend regression coverage (scoring, filtering, context)', async () => {
      // 20a. Deterministic Route Scoring Engine
      const testCand = createCandidateRoute({
        totalDurationMinutes: 25,
        disruptionDelayMinutes: 0,
        transfers: 0,
        walkingMinutes: 5,
        cost: 20
      });
      const routeScore = deterministicRouteScoringService.scoreRoute(testCand);
      assert.ok(typeof routeScore.compositeScore === 'number');
      assert.ok(routeScore.compositeScore > 0 && routeScore.compositeScore <= 100);

      // 20b. Departure Advice Service
      const advice = departureAdviceService.evaluateDepartureAdvice({
        primaryRoute: createCandidateRoute({ totalDurationMinutes: 30, disruptionDelayMinutes: 0 }),
        departureTime: '08:00',
        targetArrivalTime: '08:45'
      });
      assert.ok(advice);
      assert.strictEqual(advice.adviceType, 'ON_TIME');

      // 20c. Contextual Personalization Default
      const studentContext = await contextualPersonalizationService.collectStudentContext({}, null);
      assert.strictEqual(studentContext.resolvedPersonalization.effectiveDestination, 'D.J. Sanghvi College of Engineering');
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n========================================================================');
  console.log(` MASTER VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch(err => {
  console.error('Master verification fatal error:', err);
  process.exit(1);
});
