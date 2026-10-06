/**
 * Verification Script: Transport Network Model & Graph Representation (P9)
 *
 * Exhaustively tests the transport network foundation:
 * 1. Database Schema & Indexes (transport_segments, transport_connections)
 * 2. TransportSegment Domain Model (validation, status, toRouteLeg conversion)
 * 3. TransportConnection Domain Model (interchange, walking access, feeder shuttles)
 * 4. TransportNetworkRepository (persistence, spatial queries, graph loading, seeding)
 * 5. TransportNetwork Graph (node/edge discovery, outgoing links, direct corridors)
 * 6. Multimodal Journey Representation:
 *    Area A → Walk → Metro Station → Metro → Bus Stop → Bus → College Area → Walk
 * 7. Travel Estimate & Metrics Integrity (durations, fares, distances, transfer counts)
 * 8. Status & Disruption Awareness (active vs inactive filtering)
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const {
  TransportSegment,
  TransportConnection,
  TransportNetwork,
  CommuteRoute,
  RouteLeg,
  TravelEstimate,
  TRANSPORT_MODES,
  LEG_TYPES
} = require('../models');
const {
  transportNetworkRepository
} = require('../repositories');
const {
  transportNetworkService
} = require('../services');

async function runTransportNetworkTests() {
  console.log('\n========================================================');
  console.log(' Running Transport Network Model Verification Suite');
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

  // ==========================================================================
  // SUITE 1: DATABASE SCHEMA & INDEXES
  // ==========================================================================
  test('Database: transport_segments and transport_connections tables exist', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('transport_segments', 'transport_connections')
    `).all().map(t => t.name);

    assert(tables.includes('transport_segments'), 'transport_segments table must exist');
    assert(tables.includes('transport_connections'), 'transport_connections table must exist');
  });

  test('Database: required indexes exist on transport network tables', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index'
    `).all().map(i => i.name);

    assert(indexes.includes('idx_transport_segments_service'), 'Service index must exist');
    assert(indexes.includes('idx_transport_segments_from_stop'), 'From stop index must exist');
    assert(indexes.includes('idx_transport_segments_to_stop'), 'To stop index must exist');
    assert(indexes.includes('idx_transport_segments_mode'), 'Mode index must exist');
    assert(indexes.includes('idx_transport_connections_from_stop'), 'Connection from stop index must exist');
    assert(indexes.includes('idx_transport_connections_type'), 'Connection type index must exist');
  });

  // ==========================================================================
  // SUITE 2: TRANSPORT SEGMENT DOMAIN MODEL
  // ==========================================================================
  test('TransportSegment: instantiates, validates, and serializes correctly', () => {
    const seg = new TransportSegment({
      id: 'seg-test-01',
      serviceId: 'srv-metro-01',
      mode: TRANSPORT_MODES.METRO,
      lineIdentifier: 'Line-1',
      fromStopId: 'METRO_VERSOVA',
      toStopId: 'METRO_DNNAGAR',
      fromArea: 'Versova',
      toArea: 'DN Nagar',
      distanceKm: 1.8,
      durationMinutes: 4,
      fareRupees: 10,
      stopSequence: 1,
      status: 'ACTIVE'
    });

    assert.strictEqual(seg.id, 'seg-test-01');
    assert.strictEqual(seg.mode, 'metro');
    assert.strictEqual(seg.isOperational(), true);

    // Serialization
    const row = seg.toRow();
    assert.strictEqual(row.id, 'seg-test-01');
    assert.strictEqual(row.mode, 'metro');
    assert.strictEqual(row.distance_km, 1.8);

    const fromRow = TransportSegment.fromRow(row);
    assert.strictEqual(fromRow.id, seg.id);
    assert.strictEqual(fromRow.durationMinutes, 4);

    // Conversion to RouteLeg
    const leg = seg.toRouteLeg();
    assert(leg instanceof RouteLeg, 'Must convert to RouteLeg');
    assert.strictEqual(leg.type, LEG_TYPES.TRANSIT);
    assert.strictEqual(leg.mode, 'metro');
    assert.strictEqual(leg.from, 'Versova');
    assert.strictEqual(leg.to, 'DN Nagar');
    assert.strictEqual(leg.durationMinutes, 4);
    assert.strictEqual(leg.fareRupees, 10);
  });

  test('TransportSegment: converts walking segment to LEG_TYPES.WALK', () => {
    const walkSeg = new TransportSegment({
      id: 'seg-walk-01',
      mode: TRANSPORT_MODES.WALK,
      lineIdentifier: 'WALK',
      fromStopId: 'STOP_A',
      toStopId: 'STOP_B',
      fromArea: 'Area A',
      toArea: 'Area B',
      distanceKm: 0.5,
      durationMinutes: 6,
      fareRupees: 0
    });

    const leg = walkSeg.toRouteLeg();
    assert.strictEqual(leg.type, LEG_TYPES.WALK);
    assert.strictEqual(leg.mode, 'walk');
  });

  // ==========================================================================
  // SUITE 3: TRANSPORT CONNECTION DOMAIN MODEL
  // ==========================================================================
  test('TransportConnection: models transfers, walking access, and feeder shuttles', () => {
    const conn = new TransportConnection({
      id: 'conn-test-01',
      fromStopId: 'METRO_DNNAGAR',
      toStopId: 'BUS_ANDHERI_W',
      fromArea: 'DN Nagar',
      toArea: 'Andheri Station West',
      connectionType: 'TRANSFER',
      mode: 'walk',
      durationMinutes: 4,
      distanceKm: 0.3,
      fareRupees: 0,
      isAccessible: true,
      status: 'ACTIVE'
    });

    assert.strictEqual(conn.isOperational(), true);
    assert.strictEqual(conn.isInterchange(), true);
    assert.strictEqual(conn.isAccessible, true);

    const leg = conn.toRouteLeg();
    assert.strictEqual(leg.type, LEG_TYPES.WALK);
    assert.strictEqual(leg.mode, 'walk');
    assert.strictEqual(leg.durationMinutes, 4);

    // Feeder shuttle with fare
    const shuttle = new TransportConnection({
      id: 'conn-shuttle-01',
      fromStopId: 'STN_ANDHERI',
      toStopId: 'COLLEGE_DJS',
      fromArea: 'Andheri West',
      toArea: 'D.J. Sanghvi College of Engineering',
      connectionType: 'FEEDER_SHUTTLE',
      mode: 'shared_auto',
      durationMinutes: 8,
      distanceKm: 2.4,
      fareRupees: 20
    });

    const shuttleLeg = shuttle.toRouteLeg();
    assert.strictEqual(shuttleLeg.type, LEG_TYPES.SHARED_AUTO);
    assert.strictEqual(shuttleLeg.fareRupees, 20);
  });

  // ==========================================================================
  // SUITE 4: REPOSITORY OPERATIONS & PERSISTENCE
  // ==========================================================================
  test('TransportNetworkRepository: seeds prototype network and queries segments', () => {
    const seeded = transportNetworkRepository.seedPrototypeNetwork(true);
    assert(seeded > 0, 'Must seed segments and connections');

    // Query Western Railway segments
    const wrSegments = transportNetworkRepository.findSegments({ lineIdentifier: 'WR-SLOW' });
    assert(wrSegments.length >= 5, 'Must find WR-SLOW segments');
    assert.strictEqual(wrSegments[0].mode, 'train');

    // Query Metro segments
    const metroSegments = transportNetworkRepository.findSegments({ mode: 'metro' });
    assert(metroSegments.length >= 3, 'Must find Metro Line 1 segments');

    // Query BEST Bus segments
    const busSegments = transportNetworkRepository.findSegments({ lineIdentifier: 'BEST-201' });
    assert(busSegments.length >= 3, 'Must find BEST Bus segments');

    // Query direct corridor
    const direct = transportNetworkRepository.findSegmentsBetween('Versova', 'DN Nagar');
    assert(direct.length > 0, 'Must find direct Versova to DN Nagar segment');
  });

  test('TransportNetworkRepository: queries connections and interchanges', () => {
    const connections = transportNetworkRepository.findConnections({ connectionType: 'TRANSFER' });
    assert(connections.length > 0, 'Must find transfer connections');

    // Outgoing connections from DN Nagar Metro
    const outgoing = transportNetworkRepository.findConnectionsFrom('METRO_DNNAGAR');
    assert(outgoing.length > 0, 'Must find outgoing connections from DN Nagar');
    assert.strictEqual(outgoing[0].toStopId, 'BUS_ANDHERI_W');
  });

  // ==========================================================================
  // SUITE 5: TRANSPORT NETWORK GRAPH DISCOVERY
  // ==========================================================================
  test('TransportNetwork: discovers outgoing edges and direct corridors', () => {
    const network = transportNetworkRepository.loadNetwork();

    assert(network.getAllSegments().length > 0, 'Network must contain segments');
    assert(network.getAllConnections().length > 0, 'Network must contain connections');

    // Outgoing edges from Versova
    const versovaEdges = network.findOutgoingEdges('Versova');
    assert(versovaEdges.segments.length > 0, 'Versova must have outgoing metro segment');

    // Direct segments between Andheri and Vile Parle
    const directTrain = network.findDirectSegments('Andheri', 'Vile Parle');
    assert(directTrain.length > 0, 'Must find direct train segment between Andheri and Vile Parle');

    // Interchange transfers at Andheri
    const interchanges = network.findInterchangeTransfers('STN_ANDHERI');
    assert(interchanges.length > 0, 'Andheri must have interchange transfers');
  });

  // ==========================================================================
  // SUITE 6: REALISTIC MULTIMODAL JOURNEY ASSEMBLY
  // ==========================================================================
  test('Multimodal Journey: Assembles Area A → Walk → Metro → Bus Stop → Bus → College → Walk', () => {
    const journey = transportNetworkService.synthesizeRealisticJourney();

    assert(journey instanceof CommuteRoute, 'Must return a valid CommuteRoute');
    assert.strictEqual(journey.legs.length, 5, 'Journey must have exactly 5 distinct legs');

    // Verify leg sequence
    assert.strictEqual(journey.legs[0].mode, 'walk', 'Leg 1 must be Walk from Area A to Metro Station');
    assert.strictEqual(journey.legs[1].mode, 'metro', 'Leg 2 must be Metro transit');
    assert.strictEqual(journey.legs[2].mode, 'walk', 'Leg 3 must be Walk transfer to Bus Stop');
    assert.strictEqual(journey.legs[3].mode, 'bus', 'Leg 4 must be BEST Bus transit');
    assert.strictEqual(journey.legs[4].mode, 'walk', 'Leg 5 must be Walk from Bus Stop to College');

    // Verify origin and destination areas
    assert(journey.legs[0].from.length > 0, 'Origin area must be populated');
    const destination = journey.legs[journey.legs.length - 1].to;
    assert(destination.includes('Sanghvi') || destination.includes('College'), 'Destination must be College');

    // Verify primary mode and modes included
    assert(journey.modesIncluded.includes('metro'), 'Must include metro');
    assert(journey.modesIncluded.includes('bus'), 'Must include bus');
    assert(journey.modesIncluded.includes('walk'), 'Must include walk');

    // Verify transfer count (interchange from metro to bus)
    assert(journey.getTransferCount() >= 1, 'Multimodal journey must have at least 1 transfer');

    // Verify travel estimate calculations
    assert(journey.estimate.totalDurationMinutes > 0, 'Total duration must be positive');
    assert(journey.estimate.walkingDurationMinutes > 0, 'Walking duration must be positive');
    assert(journey.estimate.transitDurationMinutes > 0, 'Transit duration must be positive');
    assert.strictEqual(
      journey.estimate.totalDurationMinutes,
      journey.estimate.walkingDurationMinutes + journey.estimate.transitDurationMinutes,
      'Total duration must equal sum of walking and transit duration'
    );
    assert(journey.estimate.totalFareRupees > 0, 'Fare must be positive (Metro + Bus)');
    assert.strictEqual(journey.estimate.totalFareRupees, 16, 'Expected ₹10 Metro + ₹6 Bus fare');
  });

  // ==========================================================================
  // SUITE 7: DISRUPTION & STATUS AWARENESS
  // ==========================================================================
  test('Disruption Awareness: Updates segment status and filters operational edges', () => {
    const segmentId = 'seg-metro-versova-dnnagar';

    // 1. Mark segment as disrupted
    const disrupted = transportNetworkService.updateSegmentStatus(segmentId, 'DISRUPTED');
    assert.strictEqual(disrupted.status, 'DISRUPTED');

    // 2. Query operational edges only
    const options = transportNetworkService.getOutgoingOptions('METRO_VERSOVA', { operationalOnly: true });
    const hasDisrupted = options.segments.some(s => s.id === segmentId);
    assert.strictEqual(hasDisrupted, false, 'Disrupted segment must not appear in operational query');

    // 3. Restore segment to active
    const restored = transportNetworkService.updateSegmentStatus(segmentId, 'ACTIVE');
    assert.strictEqual(restored.status, 'ACTIVE');

    const optionsRestored = transportNetworkService.getOutgoingOptions('METRO_VERSOVA', { operationalOnly: true });
    const hasRestored = optionsRestored.segments.some(s => s.id === segmentId);
    assert.strictEqual(hasRestored, true, 'Restored segment must be active');
  });

  console.log('\n========================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTransportNetworkTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
