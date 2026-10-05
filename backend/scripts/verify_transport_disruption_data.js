/**
 * Verification Script: Transport and Disruption Data Layer
 *
 * Exhaustively tests:
 * 1. Migration 011 tables and schema indexes
 * 2. TransportService, TransportStop, and TransportSchedule models & serialization
 * 3. CommuteDisruption domain model and LiveReport adaptation
 * 4. 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 5. TransportRepository CRUD, stop lookups, and schedule filtering
 * 6. DisruptionRepository active lookups, pagination, and status updates
 * 7. TransportDataService and DisruptionDataService domain operations
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const {
  TransportService,
  TransportStop,
  TransportSchedule,
  CommuteDisruption,
  DataProvenance,
  PROVENANCE_TIERS,
  LiveReport
} = require('../models');

const {
  transportRepository,
  disruptionRepository
} = require('../repositories');

const {
  transportDataService,
  disruptionDataService
} = require('../services');

async function runTransportAndDisruptionTests() {
  console.log('\n========================================================');
  console.log(' Running Transport & Disruption Data Layer Verification');
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

  const db = getConnection();

  // --------------------------------------------------------------------------
  // 1. DATABASE SCHEMA & MIGRATION 011 TESTS
  // --------------------------------------------------------------------------

  test('Database: transport and disruption tables exist in SQLite catalog', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('transport_services', 'transport_stops', 'transport_schedules', 'commute_disruptions')
    `).all().map(t => t.name);

    assert(tables.includes('transport_services'), 'transport_services table must exist');
    assert(tables.includes('transport_stops'), 'transport_stops table must exist');
    assert(tables.includes('transport_schedules'), 'transport_schedules table must exist');
    assert(tables.includes('commute_disruptions'), 'commute_disruptions table must exist');
  });

  test('Database: required indexes on transport and disruption foreign keys exist', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index'
    `).all().map(i => i.name);

    assert(indexes.includes('idx_transport_services_mode'), 'idx_transport_services_mode index must exist');
    assert(indexes.includes('idx_transport_stops_service'), 'idx_transport_stops_service index must exist');
    assert(indexes.includes('idx_schedules_service'), 'idx_schedules_service index must exist');
    assert(indexes.includes('idx_disruptions_status_time'), 'idx_disruptions_status_time index must exist');
  });

  // --------------------------------------------------------------------------
  // 2. DOMAIN MODELS & PROVENANCE TESTS
  // --------------------------------------------------------------------------

  test('TransportService: instantiates and validates mode, line, stops, and provenance', () => {
    const stop1 = new TransportStop({
      id: 'stp-tst-1',
      serviceId: 'srv-tst-1',
      stopId: 'STN_BANDRA',
      stopName: 'Bandra Station',
      area: 'Bandra West',
      stopSequence: 1,
      lat: 19.0544,
      lon: 72.8406,
      isTransitHub: true
    });

    const stop2 = new TransportStop({
      id: 'stp-tst-2',
      serviceId: 'srv-tst-1',
      stopId: 'STN_ANDHERI',
      stopName: 'Andheri Station',
      area: 'Andheri West',
      stopSequence: 2,
      lat: 19.1197,
      lon: 72.8464,
      isTransitHub: true
    });

    const service = new TransportService({
      id: 'srv-tst-1',
      mode: 'train',
      lineIdentifier: 'WR-FAST-TEST',
      name: 'Western Railway Fast Local Test',
      agency: 'Western Railway',
      status: 'OPERATIONAL',
      originArea: 'Bandra West',
      destinationArea: 'Andheri West',
      fareType: 'FLAT',
      baseFare: 10,
      stops: [stop1, stop2],
      provenance: DataProvenance.verified('Official GTFS Feed', 'Official static timetable').toJSON()
    });

    assert.strictEqual(service.id, 'srv-tst-1');
    assert.strictEqual(service.mode, 'train');
    assert.strictEqual(service.isOperational(), true);
    assert.strictEqual(service.hasStop('Bandra West'), true);
    assert.strictEqual(service.hasStop('Borivali'), false);
    assert.strictEqual(service.stops.length, 2);
    assert.strictEqual(service.provenance.isVerified(), true);

    const row = service.toRow();
    assert.strictEqual(row.line_identifier, 'WR-FAST-TEST');
    assert.strictEqual(row.provenance_tier, 'VERIFIED');

    const json = service.toJSON();
    assert.strictEqual(json.stops.length, 2);
    assert.strictEqual(json.provenance.sourceTier, 'VERIFIED');
  });

  test('TransportSchedule: validates operating days and departure time formatting', () => {
    const sched = new TransportSchedule({
      id: 'sch-tst-01',
      serviceId: 'srv-tst-1',
      tripIdentifier: 'TRIP-101',
      fromStopId: 'STN_BANDRA',
      toStopId: 'STN_ANDHERI',
      departureTime: '08:30',
      arrivalTime: '08:44',
      durationMinutes: 14,
      operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      status: 'OPERATIONAL',
      provenance: DataProvenance.verified('WR GTFS').toJSON()
    });

    assert.strictEqual(sched.durationMinutes, 14);
    assert.strictEqual(sched.operatesOnDay('Monday'), true);
    assert.strictEqual(sched.operatesOnDay('Sunday'), false);

    // Invalid departure time rejected
    assert.throws(() => new TransportSchedule({
      ...sched.toJSON(),
      departureTime: '8:30' // Missing leading zero
    }), /Departure time must be in HH:MM format/);
  });

  test('CommuteDisruption: validates all 4 provenance tiers and LiveReport conversion', () => {
    const now = Date.now();

    // 1. VERIFIED Disruption
    const verifiedDisruption = CommuteDisruption.create({
      type: 'maintenance',
      affectedMode: 'train',
      affectedRouteId: 'WR-SLOW',
      affectedArea: 'Dadar - Andheri',
      severity: 'severe',
      description: 'Scheduled mega block on Western Railway slow line',
      startTime: now - 10000,
      endTime: now + 3600000,
      estimatedDelayMinutes: 20,
      provenance: DataProvenance.verified('Western Railway Bulletin').toJSON()
    });
    assert.strictEqual(verifiedDisruption.provenance.isVerified(), true);
    assert.strictEqual(verifiedDisruption.isActive(now), true);

    // 2. USER_REPORTED Disruption
    const userDisruption = CommuteDisruption.create({
      type: 'auto_refusal',
      affectedMode: 'auto',
      affectedArea: 'Andheri West',
      severity: 'moderate',
      description: 'Auto drivers refusing short distances outside station',
      durationMinutes: 60,
      provenance: DataProvenance.userReported('Community Feed').toJSON()
    });
    assert.strictEqual(userDisruption.provenance.isUserReported(), true);

    // 3. ESTIMATED Disruption
    const estimatedDisruption = CommuteDisruption.create({
      type: 'waterlogging',
      affectedMode: 'auto',
      affectedArea: 'Milan Subway',
      severity: 'severe',
      description: 'Milan Subway road underpass flooded',
      durationMinutes: 90,
      provenance: DataProvenance.estimated('Flood Sensor Heuristic').toJSON()
    });
    assert.strictEqual(estimatedDisruption.provenance.isEstimated(), true);

    // 4. SYNTHETIC Disruption
    const syntheticDisruption = CommuteDisruption.create({
      type: 'crowding',
      affectedMode: 'metro',
      affectedArea: 'Ghatkopar',
      severity: 'minor',
      description: 'Simulated morning student rush hour queue',
      durationMinutes: 45,
      provenance: DataProvenance.synthetic('Crowd Simulator').toJSON()
    });
    assert.strictEqual(syntheticDisruption.provenance.isSynthetic(), true);

    // Adapter test: LiveReport conversion
    const legacyReport = new LiveReport({
      id: 'rep-legacy-1',
      pseudonym: 'Student_Rider',
      area: 'Andheri West',
      route_name: 'Metro Line 1',
      route_id: 'Line-1',
      mode: 'metro',
      message: 'Crowded platform at Andheri Metro',
      impact: 'high',
      status: 'active',
      created_at: now,
      expires_at: now + 3600000
    });

    const adapted = CommuteDisruption.fromLiveReport(legacyReport);
    assert.strictEqual(adapted.id, 'disr-rep-legacy-1');
    assert.strictEqual(adapted.affectedMode, 'metro');
    assert.strictEqual(adapted.severity, 'severe'); // 'high' normalized to 'severe'
    assert.strictEqual(adapted.provenance.isUserReported(), true);
  });

  // --------------------------------------------------------------------------
  // 3. REPOSITORY OPERATIONS & DATA ACCESS TESTS
  // --------------------------------------------------------------------------

  test('TransportRepository: seeds and queries multimodal transit lines and stops', () => {
    transportRepository.seedInitialTransportData();

    // Query Western Line
    const wr = transportRepository.findServicesByLine('WR-SLOW');
    assert(wr !== null, 'WR-SLOW service must be found');
    assert.strictEqual(wr.mode, 'train');
    assert.strictEqual(wr.provenance.isVerified(), true);
    assert(wr.stops.length >= 5, 'WR-SLOW must have at least 5 stops');

    // Query Metro Line
    const metro = transportRepository.findServicesByLine('Line-1');
    assert(metro !== null, 'Line-1 service must be found');
    assert.strictEqual(metro.mode, 'metro');

    // Query Auto Shuttle
    const auto = transportRepository.findServicesByLine('AUTO-SHUTTLE-DJS');
    assert(auto !== null, 'Auto shuttle must be found');
    assert.strictEqual(auto.mode, 'auto');
    assert.strictEqual(auto.provenance.isEstimated(), true);

    // Find services connecting Churchgate and Borivali
    const directServices = transportRepository.findServicesConnectingAreas('Churchgate', 'Borivali');
    assert(directServices.length > 0, 'Must find service connecting Churchgate and Borivali');
    assert.strictEqual(directServices[0].lineIdentifier, 'WR-SLOW');

    // Find schedules
    const schedules = transportRepository.findSchedules('STN_BORIVALI', 'STN_VILEPARLE');
    assert(schedules.length >= 2, 'Must have schedules between Borivali and Vile Parle');
    assert.strictEqual(schedules[0].durationMinutes, 28);
  });

  test('DisruptionRepository: seeds, queries, and filters disruptions by mode and provenance', () => {
    disruptionRepository.seedInitialDisruptions();

    // Query all active
    const active = disruptionRepository.findActive();
    assert(active.length >= 4, 'Must have at least 4 active seed disruptions');

    // Filter by mode
    const trainDisruptions = disruptionRepository.findActive({ mode: 'train' });
    assert(trainDisruptions.length > 0, 'Must find train disruption');
    assert.strictEqual(trainDisruptions[0].affectedMode, 'train');

    // Filter by provenance
    const verifiedOnly = disruptionRepository.findActive({ provenanceTier: 'VERIFIED' });
    assert(verifiedOnly.length > 0, 'Must find verified disruption');
    assert.strictEqual(verifiedOnly[0].provenance.isVerified(), true);

    const userOnly = disruptionRepository.findActive({ provenanceTier: 'USER_REPORTED' });
    assert(userOnly.length > 0, 'Must find user reported disruption');
    assert.strictEqual(userOnly[0].provenance.isUserReported(), true);

    const estimatedOnly = disruptionRepository.findActive({ provenanceTier: 'ESTIMATED' });
    assert(estimatedOnly.length > 0, 'Must find estimated disruption');
    assert.strictEqual(estimatedOnly[0].provenance.isEstimated(), true);

    const syntheticOnly = disruptionRepository.findActive({ provenanceTier: 'SYNTHETIC' });
    assert(syntheticOnly.length > 0, 'Must find synthetic disruption');
    assert.strictEqual(syntheticOnly[0].provenance.isSynthetic(), true);

    // Paginated query
    const paginated = disruptionRepository.findWithPagination({ page: 1, limit: 2 });
    assert.strictEqual(paginated.data.length, 2);
    assert(paginated.total >= 4);
  });

  // --------------------------------------------------------------------------
  // 4. SERVICE LAYER TESTS
  // --------------------------------------------------------------------------

  test('TransportDataService: retrieves lines, stops, departures, and availability', () => {
    const trainLines = transportDataService.getServicesByMode('train');
    assert(trainLines.length > 0, 'Must return train lines');

    const wrDetails = transportDataService.getLineDetails('WR-SLOW');
    assert.strictEqual(wrDetails.lineIdentifier, 'WR-SLOW');
    assert.strictEqual(wrDetails.provenance.sourceTier, 'VERIFIED');

    const stops = transportDataService.getStopsForLine('WR-SLOW');
    assert(stops.length >= 5);
    assert(stops[0].stopName.includes('Churchgate'));

    const upcoming = transportDataService.getUpcomingSchedules('STN_BORIVALI', 'STN_VILEPARLE', '08:10');
    assert(upcoming.length > 0);
    assert(upcoming[0].departureTime >= '08:10');

    // Availability update
    const updated = transportDataService.setLineAvailability('WR-SLOW', 'DELAYED');
    assert.strictEqual(updated.status, 'DELAYED');

    // Reset status
    transportDataService.setLineAvailability('WR-SLOW', 'OPERATIONAL');
  });

  test('DisruptionDataService: queries corridor disruptions and records new events', () => {
    const corridorDisruptions = disruptionDataService.getDisruptionsForCorridor('Milan Subway');
    assert(corridorDisruptions.length > 0, 'Must find waterlogging disruption at Milan Subway');

    // Record new disruption
    const now = Date.now();
    const newDisruption = disruptionDataService.recordDisruption({
      type: 'delay',
      affectedMode: 'bus',
      affectedRouteId: 'BEST-201',
      affectedArea: 'JVPD Scheme',
      severity: 'moderate',
      description: 'Slow-moving BEST bus traffic near Mithibai College junction',
      durationMinutes: 45,
      provenance: DataProvenance.estimated('Traffic Heuristic Engine').toJSON()
    });

    assert.strictEqual(newDisruption.affectedMode, 'bus');
    assert.strictEqual(newDisruption.provenance.sourceTier, 'ESTIMATED');

    // Resolve disruption
    const resolved = disruptionDataService.resolveDisruption(newDisruption.id);
    assert.strictEqual(resolved, true);
  });

  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTransportAndDisruptionTests().catch(err => {
    console.error('Fatal error during transport and disruption test:', err);
    process.exit(1);
  });
}

module.exports = { runTransportAndDisruptionTests };
