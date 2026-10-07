/**
 * Day 16 Commute Context Integration Master Test Battery
 *
 * Verifies the complete commute-context system from end-to-end:
 *   Student Commute Request
 *           ↓
 *   Candidate Routes
 *           ↓
 *   Disruption Analysis
 *           ↓
 *   Traffic
 *           ↓
 *   Weather
 *           ↓
 *   Transport Availability
 *           ↓
 *   Unified Commute Context
 *           ↓
 *   Context-Aware Candidate Routes
 *
 * Test Scenarios:
 *   1. Normal day (clean conditions, zero added delay, CLEAN_JOURNEY)
 *   2. Train delay (15-20 min delay on Western Railway, DISRUPTION_DELAY)
 *   3. Bus unavailable (transit leg unavailable, route marked infeasible)
 *   4. Heavy traffic (surface road congestion delay on vehicular segments)
 *   5. Heavy rain (walking inconvenience, high travel uncertainty, weather buffer)
 *   6. Multiple disruptions (train delay + road traffic + monsoon rain additively)
 *   7. Mixed provenance (VERIFIED + USER_REPORTED + ESTIMATED, MIXED_PROVENANCE)
 *   8. Expired disruption (past events ignored, zero impact on active commute)
 *   9. Multiple candidate routes (differential modal impacts across options)
 *  10. No feasible routes (meaningful 200 response with feasibleCandidateCount: 0)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_commute_context_master.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');

function makeRequest(server, { method, path: reqPath, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };

    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: reqPath,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runCommuteContextMasterIntegrationTests() {
  console.log('========================================================================');
  console.log(' Day 16 Commute Context System — Full Master Integration Test Battery');
  console.log('========================================================================\n');

  await initDb();
  const app = createApp();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  let passed = 0;
  let failed = 0;

  async function test(scenarioNum, title, fn) {
    try {
      await fn();
      console.log(`✅ [Scenario ${scenarioNum}] PASS: ${title}`);
      passed++;
    } catch (err) {
      console.error(`❌ [Scenario ${scenarioNum}] FAIL: ${title}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const runId = Date.now();
  let studentToken = null;
  let studentId = null;

  try {
    // 0. Setup: Register and authenticate test student
    const email = `commute_master_${runId}@djsce.edu`;
    const password = 'Password123!';
    const regRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email,
        password,
        full_name: 'Master Commute Student',
        college_name: 'D.J. Sanghvi College of Engineering'
      }
    });
    assert.strictEqual(regRes.status, 201);
    studentId = regRes.body.user.id;

    const loginRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email, password }
    });
    assert.strictEqual(loginRes.status, 200);
    studentToken = loginRes.body.token;
    assert.ok(studentToken);

    // =========================================================================
    // SCENARIO 1 — Normal Day
    // No disruptions, normal traffic, clear weather, available transport
    // =========================================================================
    await test(1, 'Normal day — zero added delay, CLEAN_JOURNEY, baseline equals updated travel time', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          disruptions: [],
          trafficConditions: [],
          weatherContext: { condition: 'clear' },
          availabilityRecords: []
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidateCount > 0);
      assert.strictEqual(res.body.feasibleCandidateCount, res.body.candidateCount);
      assert.strictEqual(res.body.infeasibleCandidateCount, 0);

      const cand = res.body.candidates[0];
      // Baseline travel matches updated travel
      assert.strictEqual(cand.isFeasible, true);
      assert.strictEqual(cand.totalAdditionalDelayMinutes, 0);
      assert.strictEqual(cand.additionalDisruptionDelayMinutes, 0);
      assert.strictEqual(cand.baselineTravel.durationMinutes, cand.totalDurationMinutes);
      assert.strictEqual(cand.baselineTravel.estimatedArrivalTime, cand.estimatedArrivalTime);
      assert.ok(cand.reasonCodes.includes('CLEAN_JOURNEY'));

      // Contextual impact details
      assert.strictEqual(cand.contextualImpact.isFeasible, true);
      assert.strictEqual(cand.contextualImpact.totalAdditionalDelayMinutes, 0);
      assert.strictEqual(cand.contextualImpact.reliabilityIndicator, 'LOW');
      assert.strictEqual(cand.contextualImpact.uncertaintyLevel, 'LOW');
      assert.deepStrictEqual(cand.contextualImpact.affectedSegments, []);
      assert.deepStrictEqual(cand.contextualImpact.unavailableSegments, []);

      // Segments are clean and usable
      for (const seg of cand.segments) {
        assert.strictEqual(seg.isAffected, false);
        assert.strictEqual(seg.isUsable, true);
        assert.strictEqual(seg.contextDelayMinutes, 0);
      }
    });

    // =========================================================================
    // SCENARIO 2 — Train Delay
    // Train route receives a 15–20 minute delay
    // =========================================================================
    await test(2, 'Train delay — 18 min Western Railway delay applied additively with DISRUPTION_DELAY', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['train', 'walk'],
          disruptions: [
            {
              id: 'dis-wr-slow-signaling-18m',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'SIGNAL_FAILURE',
              severity: 'MODERATE',
              estimatedDelayMinutes: 18,
              status: 'active',
              description: 'Signal failure between Malad and Andheri causing 18 min delay'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const trainCand = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(trainCand, 'Must generate train candidate for Kandivali to DJSCE corridor');

      // 2a. Disruption delay applied additively
      assert.ok(trainCand.additionalDisruptionDelayMinutes >= 18);
      assert.strictEqual(trainCand.contextualImpact.disruptionDelayMinutes, trainCand.additionalDisruptionDelayMinutes);
      assert.ok(trainCand.totalAdditionalDelayMinutes >= 18);
      assert.strictEqual(
        trainCand.totalDurationMinutes,
        trainCand.baselineTravel.durationMinutes + trainCand.totalAdditionalDelayMinutes
      );

      // 2b. Time calculation wrapped properly
      assert.notStrictEqual(trainCand.estimatedArrivalTime, trainCand.baselineTravel.estimatedArrivalTime);

      // 2c. Reason codes and affected segment
      assert.ok(trainCand.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.contextualImpact.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.affectedSegments.length > 0);
      const trainAffSeg = trainCand.affectedSegments.find(s => s.mode === 'train');
      assert.ok(trainAffSeg, 'Train segment must be marked affected');
      assert.ok(trainAffSeg.delayMinutes >= 18);

      // 2d. Route remains feasible (18 min delay is manageable, not a blockage)
      assert.strictEqual(trainCand.isFeasible, true);
      assert.strictEqual(trainCand.contextualImpact.isFeasible, true);
    });

    // =========================================================================
    // SCENARIO 3 — Bus Unavailable
    // A candidate route becomes infeasible due to transport unavailability
    // =========================================================================
    await test(3, 'Bus unavailable — candidate route using bus becomes infeasible with SERVICE_UNAVAILABLE', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['bus', 'walk'],
          availabilityRecords: [
            {
              id: 'avail-bus-depot-strike',
              serviceId: 'BUS-201-ANDHERI-DJSCE',
              mode: 'bus',
              status: 'UNAVAILABLE',
              reason: 'BEST bus depot strike — service 201 halted',
              isUsable: false
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const busCand = res.body.candidates.find(c => c.primaryMode === 'bus' || c.modesIncluded.includes('bus'));
      assert.ok(busCand, 'Must find bus candidate for Andheri West corridor');

      // 3a. Feasibility falsified
      assert.strictEqual(busCand.isFeasible, false);
      assert.strictEqual(busCand.isViable, false);
      assert.strictEqual(busCand.feasibilityReason, 'SERVICE_UNAVAILABLE');
      assert.strictEqual(busCand.contextualImpact.isFeasible, false);
      assert.strictEqual(busCand.contextualImpact.feasibilityReason, 'SERVICE_UNAVAILABLE');

      // 3b. Reason codes disclose infeasibility
      assert.ok(busCand.reasonCodes.includes('SERVICE_UNAVAILABLE'));
      assert.ok(busCand.reasonCodes.includes('JOURNEY_INFEASIBLE'));

      // 3c. Unavailable segment recorded explicitly
      assert.ok(busCand.unavailableSegments.some(s => s.mode === 'bus'));
      assert.ok(busCand.baselineTravel.durationMinutes > 0, 'Baseline travel estimate preserved for comparison');
    });

    // =========================================================================
    // SCENARIO 4 — Heavy Traffic
    // Road-based route receives additional travel time
    // =========================================================================
    await test(4, 'Heavy traffic — road route receives +14m delay while non-road legs remain isolated', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15',
          preferredModes: ['auto', 'walk'],
          trafficConditions: [
            {
              id: 'traf-sv-road-gridlock',
              area: 'sv road',
              level: 'heavy',
              expectedDelayMinutes: 14,
              affectedModes: ['auto'],
              description: 'Heavy congestion on SV Road between Andheri and Vile Parle'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const autoCand = res.body.candidates.find(c => c.primaryMode === 'auto' || c.modesIncluded.includes('auto'));
      assert.ok(autoCand, 'Must find auto candidate');

      // 4a. Traffic impact applied
      assert.strictEqual(autoCand.trafficImpact.addedTravelTimeMinutes, 14);
      assert.strictEqual(autoCand.contextualImpact.trafficDelayMinutes, 14);
      assert.ok(autoCand.totalAdditionalDelayMinutes >= 14);
      assert.strictEqual(
        autoCand.totalDurationMinutes,
        autoCand.baselineTravel.durationMinutes + autoCand.totalAdditionalDelayMinutes
      );

      // 4b. Reason code & segment breakdown
      assert.ok(autoCand.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));
      assert.ok(autoCand.contextualImpact.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));
      const autoSeg = autoCand.segments.find(s => s.mode === 'auto');
      assert.ok(autoSeg);
      assert.strictEqual(autoSeg.isAffected, true);
      assert.ok(autoSeg.contextDelayMinutes >= 14);

      // Route remains feasible under heavy traffic (practical delay)
      assert.strictEqual(autoCand.isFeasible, true);
    });

    // =========================================================================
    // SCENARIO 5 — Heavy Rain
    // Walking-heavy route receives increased inconvenience/impact
    // =========================================================================
    await test(5, 'Heavy rain — walking segments incur inconvenience and high travel uncertainty buffer', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Vile Parle West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:15',
          preferredModes: ['walk'],
          weatherContext: {
            condition: 'heavy_rain',
            temperatureC: 28,
            precipitationProbability: 95,
            humidityPercent: 92
          }
        }
      });

      assert.strictEqual(res.status, 200);
      const walkCand = res.body.candidates.find(c => c.primaryMode === 'walk' || c.walkingTimeMinutes >= 10);
      assert.ok(walkCand, 'Must find pedestrian candidate');

      // 5a. Weather impact evaluated
      const wImpact = walkCand.weatherImpact;
      assert.ok(wImpact, 'Must include weatherImpact');
      assert.strictEqual(wImpact.condition, 'heavy_rain');
      assert.strictEqual(wImpact.walkingInconvenience?.level, 'HIGH');
      assert.strictEqual(wImpact.travelUncertainty?.level, 'HIGH');
      assert.ok(wImpact.travelUncertainty?.recommendEarlyDepartureMinutes >= 15);

      // 5b. Outdoor segments identified
      assert.ok(wImpact.affectedOutdoorSegments?.length > 0);
      assert.ok(walkCand.reasonCodes.includes('WEATHER_IMPACT'));

      // 5c. Viability preserved (monsoon rain does not arbitrarily make walking impossible)
      assert.strictEqual(walkCand.isFeasible, true);
      assert.strictEqual(walkCand.contextualImpact.isFeasible, true);
    });

    // =========================================================================
    // SCENARIO 6 — Multiple Disruptions
    // Train delay + heavy traffic + rain evaluated concurrently
    // =========================================================================
    await test(6, 'Multiple disruptions — train delay + road traffic + rain combine additively without double-counting', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          disruptions: [
            {
              id: 'dis-wr-slow-multiple',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'SIGNAL_FAILURE',
              severity: 'MODERATE',
              estimatedDelayMinutes: 16,
              status: 'active',
              description: 'Signal failure between Malad and Andheri'
            }
          ],
          trafficConditions: [
            {
              id: 'traf-sv-road-multiple',
              area: 'sv road',
              level: 'moderate',
              expectedDelayMinutes: 6,
              affectedModes: ['auto', 'bus'],
              description: 'Moderate surface traffic'
            }
          ],
          weatherContext: {
            condition: 'rain',
            temperatureC: 27,
            precipitationProbability: 80
          }
        }
      });

      assert.strictEqual(res.status, 200);
      const trainCand = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(trainCand);

      // 6a. Additive math verification: disruptionDelay + trafficDelay + weatherDelay
      const dDelay = trainCand.contextualImpact.disruptionDelayMinutes;
      const tDelay = trainCand.contextualImpact.trafficDelayMinutes;
      const wDelay = trainCand.contextualImpact.weatherDelayMinutes;
      const aDelay = trainCand.contextualImpact.availabilityDelayMinutes;

      assert.strictEqual(
        trainCand.totalAdditionalDelayMinutes,
        dDelay + tDelay + wDelay + aDelay,
        'Composite delay must strictly equal the sum of component delays without double counting'
      );
      assert.strictEqual(
        trainCand.totalDurationMinutes,
        trainCand.baselineTravel.durationMinutes + trainCand.totalAdditionalDelayMinutes
      );

      // 6b. Reason codes show multiple simultaneous impacts
      assert.ok(trainCand.reasonCodes.includes('MULTIPLE_SIMULTANEOUS_IMPACTS'));
      assert.ok(trainCand.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.reasonCodes.includes('WEATHER_IMPACT'));
    });

    // =========================================================================
    // SCENARIO 7 — Mixed Provenance
    // Verified transport status + estimated travel time + user-reported disruption
    // =========================================================================
    await test(7, 'Mixed provenance — aggregates VERIFIED, USER_REPORTED, and ESTIMATED tiers with MIXED_PROVENANCE', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          preferredModes: ['train', 'walk'],
          disruptions: [
            {
              id: 'dis-crowdsourced-signal',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'SIGNAL_FAILURE',
              severity: 'MODERATE',
              estimatedDelayMinutes: 10,
              status: 'active',
              provenance: {
                tier: 'USER_REPORTED',
                sourceTier: 'USER_REPORTED',
                provider: 'Student Commute WhatsApp Forum',
                confidence: 'MEDIUM'
              }
            }
          ],
          availabilityRecords: [
            {
              id: 'avail-wr-verified',
              serviceId: 'TRAIN-WR-SLOW',
              mode: 'train',
              status: 'DELAYED',
              expectedDelayMinutes: 5,
              reason: 'Official Western Railway Control announcement',
              provenance: {
                tier: 'VERIFIED',
                sourceTier: 'VERIFIED',
                provider: 'Western Railway Control Center',
                confidence: 'HIGH'
              }
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);

      // 7a. Top-level envelope provenance aggregation
      const meta = res.body.provenanceMetadata;
      assert.ok(meta);
      assert.ok(meta.dataTiers.includes('VERIFIED'), 'Must include VERIFIED tier');
      assert.ok(meta.dataTiers.includes('USER_REPORTED'), 'Must include USER_REPORTED tier');
      assert.ok(meta.dataTiers.includes('ESTIMATED'), 'Must include ESTIMATED tier');
      assert.strictEqual(meta.hasVerifiedData, true);
      assert.strictEqual(meta.hasUserReportedData, true);
      assert.strictEqual(meta.hasEstimatedData, true);

      // 7b. Candidate carries MIXED_PROVENANCE reason code
      const cand = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(cand);
      assert.ok(cand.reasonCodes.includes('MIXED_PROVENANCE'));
      assert.ok(cand.contextualImpact.dataTiers.length >= 2);
    });

    // =========================================================================
    // SCENARIO 8 — Expired Disruption
    // Expired information must not affect current journeys
    // =========================================================================
    await test(8, 'Expired disruption — past disruption is ignored and does not alter current journey', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const twoHoursAgo = now - 120 * 60 * 1000;

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Kandivali West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          currentTime: now,
          disruptions: [
            {
              id: 'dis-wr-slow-expired',
              affectedArea: 'Western Railway',
              affectedRouteId: 'WR-SLOW',
              affectedMode: 'train',
              disruptionType: 'SIGNAL_FAILURE',
              severity: 'SEVERE',
              estimatedDelayMinutes: 45,
              status: 'active',
              startTime: twoHoursAgo,
              endTime: oneHourAgo, // Already ended 1 hour ago
              description: 'Historical signaling incident from morning rush hour'
            }
          ],
          trafficConditions: [
            {
              id: 'traf-expired-jam',
              area: 'sv road',
              level: 'severe',
              expectedDelayMinutes: 30,
              startTime: twoHoursAgo,
              expiryTime: oneHourAgo // Already expired
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      const trainCand = res.body.candidates.find(c => c.primaryMode === 'train' || c.modesIncluded.includes('train'));
      assert.ok(trainCand);

      // Expired events must produce 0 delay
      assert.strictEqual(trainCand.additionalDisruptionDelayMinutes, 0);
      assert.strictEqual(trainCand.contextualImpact.disruptionDelayMinutes, 0);
      assert.strictEqual(trainCand.contextualImpact.trafficDelayMinutes, 0);
      assert.strictEqual(trainCand.totalAdditionalDelayMinutes, 0);
      assert.strictEqual(trainCand.totalDurationMinutes, trainCand.baselineTravel.durationMinutes);
      assert.strictEqual(trainCand.estimatedArrivalTime, trainCand.baselineTravel.estimatedArrivalTime);
      assert.ok(!trainCand.reasonCodes.includes('DISRUPTION_DELAY'));
      assert.ok(trainCand.isFeasible, true);
    });

    // =========================================================================
    // SCENARIO 9 — Multiple Candidate Routes
    // Different candidates receive different impacts
    // =========================================================================
    await test(9, 'Multiple candidate routes — auto receives road traffic delay while metro remains isolated', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Lokhandwala Complex',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          limit: 5,
          trafficConditions: [
            {
              id: 'traf-link-road-heavy-differential',
              area: 'Link Road',
              level: 'heavy',
              expectedDelayMinutes: 18,
              affectedModes: ['auto'],
              description: 'Link Road surface congestion'
            }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.candidates.length >= 2);

      const autoCand = res.body.candidates.find(c => c.primaryMode === 'auto');
      const metroCand = res.body.candidates.find(c => c.primaryMode === 'metro' || c.modesIncluded.includes('metro'));

      assert.ok(autoCand, 'Must have direct auto candidate');
      assert.ok(metroCand, 'Must have multimodal metro candidate');

      // 9a. Auto candidate receives road delay
      assert.ok(autoCand.totalAdditionalDelayMinutes >= 18);
      assert.strictEqual(autoCand.contextualImpact.trafficDelayMinutes, 18);
      assert.ok(autoCand.reasonCodes.includes('ROAD_TRAFFIC_CONGESTION'));

      // 9b. Metro transit leg receives zero road traffic delay
      const metroSeg = metroCand.segments.find(s => s.mode === 'metro');
      assert.ok(metroSeg);
      assert.strictEqual(metroSeg.isAffected, false);
      assert.strictEqual(metroSeg.contextDelayMinutes, 0);

      // 9c. Clear differential verified
      assert.notStrictEqual(
        autoCand.totalAdditionalDelayMinutes,
        metroCand.contextualImpact.trafficDelayMinutes,
        'Auto candidate and metro candidate must exhibit different impacts'
      );
    });

    // =========================================================================
    // SCENARIO 10 — No Feasible Routes
    // API must return a meaningful response rather than crashing
    // =========================================================================
    await test(10, 'No feasible routes — returns structured HTTP 200 with feasibleCandidateCount: 0 and isFeasible: false', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/commute/candidates',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          startingArea: 'Andheri West',
          collegeDestination: 'D.J. Sanghvi College of Engineering',
          desiredDepartureTime: '08:00',
          availabilityRecords: [
            { id: 'av-tr-block', mode: 'train', status: 'SUSPENDED', isUsable: false, reason: 'Total power grid outage' },
            { id: 'av-mt-block', mode: 'metro', status: 'SUSPENDED', isUsable: false, reason: 'Line 1 maintenance block' },
            { id: 'av-bu-block', mode: 'bus', status: 'SUSPENDED', isUsable: false, reason: 'Severe depot waterlogging' },
            { id: 'av-au-block', mode: 'auto', status: 'UNAVAILABLE', isUsable: false, reason: 'City-wide taxi strike' },
            { id: 'av-sh-block', mode: 'shared_auto', status: 'UNAVAILABLE', isUsable: false, reason: 'City-wide taxi strike' }
          ]
        }
      });

      // 10a. Graceful non-crashing HTTP 200 response
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.candidateCount > 0, 'Candidate routes generated from static graph');
      assert.strictEqual(res.body.feasibleCandidateCount, 0, 'Zero candidates should be feasible');
      assert.strictEqual(res.body.infeasibleCandidateCount, res.body.candidateCount);
      assert.strictEqual(res.body.contextSummary.hasInfeasibleCandidates, true);

      // 10b. Every candidate explicitly marked infeasible with informative reasons
      for (const cand of res.body.candidates) {
        assert.strictEqual(cand.isFeasible, false);
        assert.strictEqual(cand.isViable, false);
        assert.strictEqual(cand.contextualImpact.isFeasible, false);
        assert.ok(
          cand.reasonCodes.includes('JOURNEY_INFEASIBLE') ||
          cand.reasonCodes.includes('SERVICE_SUSPENDED') ||
          cand.reasonCodes.includes('SERVICE_UNAVAILABLE')
        );
      }
    });

  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n========================================================================');
  console.log(` FULL INTEGRATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCommuteContextMasterIntegrationTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
