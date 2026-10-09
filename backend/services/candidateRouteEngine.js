/**
 * CandidateRouteEngine
 *
 * First-version Candidate Route Generation Engine for the Smart Student Commute Companion (P9).
 *
 * Responsibility:
 * Generates a set of feasible candidate journeys from available transport network and
 * timetable data connecting a student's origin to their college destination.
 *
 * Design Principles:
 * - Does NOT choose the "best route" or apply subjective ranking.
 * - Does NOT call an LLM or use non-deterministic reasoning.
 * - Produces multiple viable, diverse candidate journeys for subsequent scoring.
 * - Applies hard feasibility constraints (service availability, operating hours,
 *   transfer limits, walking limits, arrival deadlines, mode filters).
 * - Avoids combinatorial explosion via bounded, deterministic search.
 */

const {
  CommuteJourney,
  JourneySegment,
  JOURNEY_SEGMENT_TYPES,
  RouteLeg,
  CommuteRoute,
  TransportSegment,
  TransportConnection,
  TRANSPORT_MODES,
  LEG_TYPES,
  DataProvenance
} = require('../models');
const { transportScheduleService } = require('./transportScheduleService');
const { transportNetworkService } = require('./transportNetworkService');
const { journeyBuilderService } = require('./journeyBuilderService');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Coarse Mumbai location coordinates / distance approximations (km from D.J. Sanghvi College, Vile Parle West)
const KNOWN_CAMPUS_DISTANCES = {
  'vile parle west': 1.0,
  'vile parle': 1.2,
  'juhu': 1.5,
  'juhu circle': 1.8,
  'andheri west': 3.5,
  'andheri': 4.0,
  'dn nagar': 3.2,
  'versova': 4.5,
  'lokhandwala': 4.8,
  'lokhandwala complex': 4.8,
  'area a': 4.8,
  'goregaon west': 8.5,
  'goregaon': 9.0,
  'malad west': 11.5,
  'malad': 12.0,
  'kandivali west': 14.5,
  'kandivali': 15.0,
  'borivali west': 17.5,
  'borivali': 18.0,
  'bandra west': 8.0,
  'santacruz west': 3.5
};

class CandidateRouteEngine {
  /**
   * @param {object} [options={}]
   * @param {object} [options.scheduleService]
   * @param {object} [options.networkService]
   * @param {object} [options.journeyBuilder]
   */
  constructor(options = {}) {
    this.scheduleService = options.scheduleService || transportScheduleService;
    this.networkService = options.networkService || transportNetworkService;
    this.journeyBuilder = options.journeyBuilder || journeyBuilderService;
  }

  // ==========================================================================
  // 1. PRIMARY GENERATION API
  // ==========================================================================

  /**
   * Generates candidate commute journeys based on origin, destination, timing, and constraints.
   *
   * @param {object} params
   * @param {string|object} params.origin - Origin locality or area name
   * @param {string|object} [params.destination] - College destination (defaults to D.J. Sanghvi)
   * @param {string} [params.departureTime] - Desired departure time in HH:MM (e.g. '08:00')
   * @param {string} [params.desiredDepartureTime] - Alias for departureTime
   * @param {string} [params.targetArrivalTime] - Desired arrival deadline in HH:MM (e.g. '08:50')
   * @param {string} [params.desiredArrivalTime] - Alias for targetArrivalTime
   * @param {object} [params.preferences={}] - Mode preferences (allowedModes, avoidModes, preferredModes)
   * @param {object} [params.constraints={}] - Hard constraints (maxTransfers, maxWalkingMinutes, maxBudgetRupees)
   * @param {string|Date} [params.date='Mon'] - Commute date or day of week
   * @param {string} [params.dayOfWeek='Mon'] - Day of week
   * @param {object} [params.options={}] - Search controls (limit, includeDirectAuto, includeDirectWalk)
   * @returns {Promise<Array<CommuteJourney>>} Array of feasible candidate journeys
   */
  async generateCandidates(params = {}) {
    // Support Stage 1 context envelope if passed directly
    const normalizedParams = this._normalizeParams(params);
    const {
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      preferences,
      constraints,
      date,
      dayOfWeek,
      options
    } = normalizedParams;

    // Load active transport network
    const network = this.networkService.getNetwork({ operationalOnly: false });

    // Collect candidate blueprints
    const candidateJourneys = [];
    const rejectedCandidates = [];

    const handleCandidate = (cand) => {
      if (!cand) return;
      if (options.unfiltered) {
        candidateJourneys.push(cand);
      } else {
        this._evaluateCandidate(cand, { preferences, constraints, targetArrivalTime }, candidateJourneys, rejectedCandidates);
      }
    };

    // 1. Candidate Strategy A: Direct Route (Walking if within 2.5km, Auto-rickshaw direct)
    if (options.includeDirectWalk !== false) {
      const walkCandidate = this._buildDirectWalkCandidate({ origin, destination, departureTime, targetArrivalTime });
      if (walkCandidate) {
        handleCandidate(walkCandidate);
      }
    }

    if (options.includeDirectAuto !== false) {
      const autoCandidate = this._buildDirectAutoCandidate({ origin, destination, departureTime, targetArrivalTime });
      if (autoCandidate) {
        handleCandidate(autoCandidate);
      }
    }

    // 2. Candidate Strategy B: Suburban Train Corridors (Western Railway Local + Walk/Feeder)
    const trainCandidates = this._buildTrainCandidates({
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      network
    });
    for (const cand of trainCandidates) {
      handleCandidate(cand);
    }

    // 3. Candidate Strategy C: Metro Line 1 + Bus Feeder (Canonical Multimodal Interchange)
    const metroBusCandidates = this._buildMetroBusCandidates({
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      network
    });
    for (const cand of metroBusCandidates) {
      handleCandidate(cand);
    }

    // 4. Candidate Strategy D: Direct City Bus Corridor (BEST Bus 201 + Campus Walk)
    const busCandidates = this._buildDirectBusCandidates({
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      network
    });
    for (const cand of busCandidates) {
      handleCandidate(cand);
    }

    // 5. Candidate Strategy E: Metro + Shared Auto Feeder
    const metroAutoCandidates = this._buildMetroAutoCandidates({
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      network
    });
    for (const cand of metroAutoCandidates) {
      handleCandidate(cand);
    }

    // 6. Candidate Strategy F: Deterministic Network Graph Search (Breadth-First Path Discovery)
    const graphCandidates = this._searchNetworkGraphPaths({
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      network,
      preferences,
      constraints
    });
    for (const cand of graphCandidates) {
      handleCandidate(cand);
    }

    // Deduplicate candidates deterministically
    const uniqueCandidates = this._deduplicateCandidates(candidateJourneys);

    // Apply overall limit (default 6 candidates to prevent downstream overload)
    const limit = Math.max(1, options.limit || 8);
    return uniqueCandidates.slice(0, limit);
  }

  /**
   * Generates candidates and converts them directly into CommuteRoute instances.
   * Useful for recommendation pipeline Stage 4 integration.
   *
   * @param {object} params
   * @returns {Promise<Array<CommuteRoute>>}
   */
  async generateCandidateRoutes(params = {}) {
    const journeys = await this.generateCandidates(params);
    return journeys.map(j => (j instanceof CommuteRoute ? j : j.toCommuteRoute()));
  }

  // ==========================================================================
  // 2. CANDIDATE GENERATION STRATEGIES
  // ==========================================================================

  /**
   * Builds direct pedestrian walking candidate if distance is feasible (< 2.5 km).
   * @private
   */
  _buildDirectWalkCandidate({ origin, destination, departureTime }) {
    const distanceKm = this._estimateDistanceKm(origin, destination);
    if (distanceKm > 2.5) {
      // Walking over 2.5 km directly is impractical for daily student transit
      return null;
    }

    const durationMinutes = Math.max(5, Math.round((distanceKm / 4.5) * 60)); // ~4.5 km/h walk speed
    const depTime = departureTime || '08:15';

    try {
      return this.journeyBuilder.buildSingleModeJourney({
        id: `cand-direct-walk-${depTime.replace(':', '')}`,
        origin,
        destination,
        mode: TRANSPORT_MODES.WALK,
        departureTime: depTime,
        durationMinutes,
        distanceKm,
        fareRupees: 0,
        instructions: `Walk directly from ${origin} to ${destination}`
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Builds direct on-demand auto-rickshaw journey (0 transfers, road-based).
   * @private
   */
  _buildDirectAutoCandidate({ origin, destination, departureTime }) {
    const distanceKm = this._estimateDistanceKm(origin, destination);
    // Typical Mumbai city auto speed: ~15 km/h in peak morning traffic
    const durationMinutes = Math.max(8, Math.round((distanceKm / 15.0) * 60));
    // Mumbai standard auto fare: min Rs 23 for first 1.5km, then ~Rs 15.33/km
    const fareRupees = distanceKm <= 1.5 ? 23 : Math.round(23 + (distanceKm - 1.5) * 15.33);
    const depTime = departureTime || '08:00';

    try {
      return this.journeyBuilder.buildSingleModeJourney({
        id: `cand-direct-auto-${depTime.replace(':', '')}`,
        origin,
        destination,
        mode: TRANSPORT_MODES.AUTO,
        departureTime: depTime,
        durationMinutes,
        waitingTimeMinutes: 3, // Hailing / meter hailing wait
        distanceKm,
        fareRupees,
        instructions: `Hail auto-rickshaw from ${origin} directly to ${destination}`
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Builds Western Railway suburban train candidates with campus walking or feeder egress.
   * @private
   */
  _buildTrainCandidates({ origin, destination, departureTime, date, dayOfWeek, network }) {
    const candidates = [];
    const originLower = (origin || '').toLowerCase();

    // Check if origin connects to Western Railway (Borivali, Kandivali, Malad, Goregaon, Andheri)
    const railwayStops = [
      { name: 'borivali', stopId: 'STN_BORIVALI', walkMinutes: 6, walkKm: 0.5 },
      { name: 'kandivali', stopId: 'STN_KANDIVALI', walkMinutes: 5, walkKm: 0.4 },
      { name: 'malad', stopId: 'STN_MALAD', walkMinutes: 5, walkKm: 0.4 },
      { name: 'goregaon', stopId: 'STN_GOREGAON', walkMinutes: 6, walkKm: 0.5 },
      { name: 'andheri', stopId: 'STN_ANDHERI', walkMinutes: 4, walkKm: 0.3 }
    ];

    const matchedStop = railwayStops.find(s => originLower.includes(s.name));
    if (!matchedStop) {
      return candidates;
    }

    const depTime = departureTime || '08:00';

    // Route 1: Train to Vile Parle Station + Walk to D.J. Sanghvi (10 min)
    try {
      const trainSegments = network.getAllSegments().filter(s =>
        s.mode === TRANSPORT_MODES.TRAIN && s.lineIdentifier === 'WR-SLOW'
      );

      // Find chain from matchedStop to STN_VILEPARLE
      const chain = this._findSegmentChain(trainSegments, matchedStop.stopId, 'STN_VILEPARLE');
      if (chain.length > 0) {
        // Find walking connection from Vile Parle station to college
        const walkToCollege = network.getAllConnections().find(c =>
          c.fromStopId === 'STN_VILEPARLE' && c.toStopId === 'COLLEGE_DJS'
        );

        const steps = [];
        // First mile walk to station if origin is neighborhood
        if (!originLower.includes('station')) {
          steps.push(new TransportConnection({
            id: `conn-walk-origin-to-${matchedStop.name}`,
            fromStopId: `ORIGIN_${matchedStop.name.toUpperCase()}`,
            toStopId: matchedStop.stopId,
            fromArea: origin,
            toArea: chain[0].fromArea || `${matchedStop.name.charAt(0).toUpperCase() + matchedStop.name.slice(1)} Station`,
            connectionType: 'WALKING_ACCESS',
            mode: 'walk',
            durationMinutes: matchedStop.walkMinutes,
            distanceKm: matchedStop.walkKm,
            fareRupees: 0,
            status: 'ACTIVE'
          }));
        }

        // Add train segments
        steps.push(...chain);

        // Add last mile walk
        if (walkToCollege) {
          steps.push(walkToCollege);
        }

        const journey = this.journeyBuilder.buildMultimodalFromNetwork(steps, {
          id: `cand-train-walk-${matchedStop.name}-${depTime.replace(':', '')}`,
          initialDepartureTime: depTime,
          date,
          dayOfWeek,
          origin,
          destination
        });

        candidates.push(journey);
      }
    } catch (err) {
      // Ignored if chain fails
    }

    // Route 2: Train to Andheri Station + Shared Auto to DJS (8 min, Rs 20)
    if (matchedStop.stopId !== 'STN_ANDHERI') {
      try {
        const trainSegments = network.getAllSegments().filter(s =>
          s.mode === TRANSPORT_MODES.TRAIN && s.lineIdentifier === 'WR-SLOW'
        );

        const chain = this._findSegmentChain(trainSegments, matchedStop.stopId, 'STN_ANDHERI');
        const shuttleConn = network.getAllConnections().find(c =>
          c.fromStopId === 'STN_ANDHERI' && c.toStopId === 'COLLEGE_DJS' && c.connectionType === 'FEEDER_SHUTTLE'
        );

        if (chain.length > 0 && shuttleConn) {
          const steps = [];
          if (!originLower.includes('station')) {
            steps.push(new TransportConnection({
              id: `conn-walk-origin-to-${matchedStop.name}`,
              fromStopId: `ORIGIN_${matchedStop.name.toUpperCase()}`,
              toStopId: matchedStop.stopId,
              fromArea: origin,
              toArea: chain[0].fromArea || `${matchedStop.name.charAt(0).toUpperCase() + matchedStop.name.slice(1)} Station`,
              connectionType: 'WALKING_ACCESS',
              mode: 'walk',
              durationMinutes: matchedStop.walkMinutes,
              distanceKm: matchedStop.walkKm,
              fareRupees: 0,
              status: 'ACTIVE'
            }));
          }

          steps.push(...chain);
          steps.push(shuttleConn);

          const journey = this.journeyBuilder.buildMultimodalFromNetwork(steps, {
            id: `cand-train-auto-${matchedStop.name}-${depTime.replace(':', '')}`,
            initialDepartureTime: depTime,
            date,
            dayOfWeek,
            origin,
            destination
          });

          candidates.push(journey);
        }
      } catch (err) {
        // Ignored if chain fails
      }
    }

    return candidates;
  }

  /**
   * Builds canonical multimodal Metro Line 1 + BEST Feeder Bus 201 candidate.
   * (Area A / Lokhandwala / Versova → Walk → Metro → Transfer → Bus → Walk → College)
   * @private
   */
  _buildMetroBusCandidates({ origin, destination, departureTime, date, dayOfWeek, network }) {
    const candidates = [];
    const originLower = (origin || '').toLowerCase();

    // Check if origin connects to Metro Line 1 western corridor
    const connectsToMetro = originLower.includes('lokhandwala') ||
      originLower.includes('versova') ||
      originLower.includes('area a') ||
      originLower.includes('dn nagar') ||
      originLower.includes('andheri west');

    if (!connectsToMetro) {
      return candidates;
    }

    const depTime = departureTime || '08:00';

    try {
      const walkToMetro = network.getAllConnections().find(c => c.id === 'conn-walk-area-a-to-metro') ||
        network.getAllConnections().find(c => c.toStopId === 'METRO_VERSOVA' && c.mode === 'walk');

      const metroSegment = network.getAllSegments().find(s => s.id === 'seg-metro-versova-dnnagar') ||
        network.getAllSegments().find(s => s.mode === TRANSPORT_MODES.METRO && s.toStopId === 'METRO_DNNAGAR');

      const walkToBus = network.getAllConnections().find(c => c.id === 'conn-walk-metro-to-bus-stop') ||
        network.getAllConnections().find(c => c.fromStopId === 'METRO_DNNAGAR' && c.toStopId.includes('BUS'));

      const busSegments = network.getAllSegments().filter(s =>
        s.mode === TRANSPORT_MODES.BUS && s.serviceId === 'srv-best-201'
      );
      const busChain = this._findSegmentChain(busSegments, 'BUS_ANDHERI_W', 'BUS_IRLA_DJS');

      const walkToCollege = network.getAllConnections().find(c => c.id === 'conn-walk-bus-to-college') ||
        network.getAllConnections().find(c => c.toStopId === 'COLLEGE_DJS' && c.mode === 'walk');

      if (walkToMetro && metroSegment && walkToBus && busChain.length > 0 && walkToCollege) {
        const steps = [walkToMetro, metroSegment, walkToBus, ...busChain, walkToCollege];

        const journey = this.journeyBuilder.buildMultimodalFromNetwork(steps, {
          id: `cand-metro-bus-${depTime.replace(':', '')}`,
          initialDepartureTime: depTime,
          date,
          dayOfWeek,
          origin,
          destination
        });

        candidates.push(journey);
      }
    } catch (err) {
      // Ignored if steps fail
    }

    return candidates;
  }

  /**
   * Builds direct BEST Bus 201 corridor candidate (Bus + Campus Walk).
   * @private
   */
  _buildDirectBusCandidates({ origin, destination, departureTime, date, dayOfWeek, network }) {
    const candidates = [];
    const originLower = (origin || '').toLowerCase();

    // Check if origin connects to BEST Route 201 stops (Andheri Station W, Gulmohar, Juhu Circle)
    const busOrigins = [
      { name: 'andheri', stopId: 'BUS_ANDHERI_W' },
      { name: 'gulmohar', stopId: 'BUS_GULMOHAR' },
      { name: 'juhu', stopId: 'BUS_JUHU_CIRCLE' },
      { name: 'dn nagar', stopId: 'BUS_ANDHERI_W' }
    ];

    const match = busOrigins.find(b => originLower.includes(b.name));
    if (!match) {
      return candidates;
    }

    const depTime = departureTime || '08:00';

    try {
      const busSegments = network.getAllSegments().filter(s =>
        s.mode === TRANSPORT_MODES.BUS && s.serviceId === 'srv-best-201'
      );

      const chain = this._findSegmentChain(busSegments, match.stopId, 'BUS_IRLA_DJS');
      const walkToCollege = network.getAllConnections().find(c =>
        c.fromStopId === 'BUS_IRLA_DJS' && c.toStopId === 'COLLEGE_DJS'
      );

      if (chain.length > 0 && walkToCollege) {
        const steps = [];
        // First mile walk to bus stand
        if (!originLower.includes('bus') && !originLower.includes('stop')) {
          steps.push(new TransportConnection({
            id: `conn-walk-origin-to-${match.name}-bus`,
            fromStopId: `ORIGIN_${match.name.toUpperCase()}`,
            toStopId: match.stopId,
            fromArea: origin,
            toArea: `${match.name.charAt(0).toUpperCase() + match.name.slice(1)} Bus Stand`,
            connectionType: 'WALKING_ACCESS',
            mode: 'walk',
            durationMinutes: 4,
            distanceKm: 0.3,
            fareRupees: 0,
            status: 'ACTIVE'
          }));
        }

        steps.push(...chain);
        steps.push(walkToCollege);

        const journey = this.journeyBuilder.buildMultimodalFromNetwork(steps, {
          id: `cand-direct-bus-${match.name}-${depTime.replace(':', '')}`,
          initialDepartureTime: depTime,
          date,
          dayOfWeek,
          origin,
          destination
        });

        candidates.push(journey);
      }
    } catch (err) {
      // Ignored if steps fail
    }

    return candidates;
  }

  /**
   * Builds Metro Line 1 + Shared Auto Feeder from Andheri Station.
   * @private
   */
  _buildMetroAutoCandidates({ origin, destination, departureTime, date, dayOfWeek, network }) {
    const candidates = [];
    const originLower = (origin || '').toLowerCase();

    if (!originLower.includes('versova') && !originLower.includes('lokhandwala') && !originLower.includes('dn nagar')) {
      return candidates;
    }

    const depTime = departureTime || '08:00';

    try {
      const walkToMetro = network.getAllConnections().find(c => c.id === 'conn-walk-area-a-to-metro') ||
        network.getAllConnections().find(c => c.toStopId === 'METRO_VERSOVA' && c.mode === 'walk');

      const metroToAndheri = network.getAllSegments().filter(s =>
        s.mode === TRANSPORT_MODES.METRO && s.lineIdentifier === 'Line-1'
      );

      const chain = this._findSegmentChain(metroToAndheri, 'METRO_VERSOVA', 'METRO_ANDHERI');

      const interchangeWalk = network.getAllConnections().find(c =>
        c.fromStopId === 'METRO_ANDHERI' && c.toStopId === 'STN_ANDHERI'
      ) || network.getAllConnections().find(c =>
        c.id === 'conn-interchange-wr-to-metro'
      );

      const autoShuttle = network.getAllConnections().find(c =>
        c.fromStopId === 'STN_ANDHERI' && c.toStopId === 'COLLEGE_DJS' && c.connectionType === 'FEEDER_SHUTTLE'
      );

      if (walkToMetro && chain.length > 0 && autoShuttle) {
        const steps = [
          walkToMetro,
          ...chain,
          new TransportConnection({
            id: 'conn-interchange-metro-to-auto-stand',
            fromStopId: 'METRO_ANDHERI',
            toStopId: 'STN_ANDHERI',
            fromArea: 'Andheri Metro',
            toArea: 'Andheri West Station',
            connectionType: 'INTERCHANGE',
            mode: 'walk',
            durationMinutes: 3,
            distanceKm: 0.2,
            fareRupees: 0,
            status: 'ACTIVE'
          }),
          autoShuttle
        ];

        const journey = this.journeyBuilder.buildMultimodalFromNetwork(steps, {
          id: `cand-metro-auto-${depTime.replace(':', '')}`,
          initialDepartureTime: depTime,
          date,
          dayOfWeek,
          origin,
          destination
        });

        candidates.push(journey);
      }
    } catch (err) {
      // Ignored if steps fail
    }

    return candidates;
  }

  /**
   * Deterministic Breadth-First Search (BFS) over TransportNetwork graph.
   * Finds connected multimodal routes from matched origin nodes to college destination.
   * @private
   */
  _searchNetworkGraphPaths({ origin, destination, departureTime, date, dayOfWeek, network, preferences, constraints }) {
    const candidates = [];
    const originLower = (origin || '').toLowerCase();
    const depTime = departureTime || '08:00';

    // 1. Identify start nodes in network graph
    const allStops = network.getAllStops();
    const startStopCandidates = allStops.filter(s => {
      const stopAreaLower = (s.area || '').toLowerCase();
      const stopNameLower = (s.stopName || '').toLowerCase();
      return originLower.includes(stopAreaLower) ||
             stopAreaLower.includes(originLower) ||
             originLower.includes(stopNameLower);
    });

    // Also check connections originating from matching area
    const startConnections = network.getAllConnections().filter(c =>
      originLower.includes((c.fromArea || '').toLowerCase()) ||
      (c.fromArea || '').toLowerCase().includes(originLower)
    );

    const targetStopId = 'COLLEGE_DJS';
    const maxDepth = 6;
    const maxTransfers = constraints.maxTransfers !== undefined ? Number(constraints.maxTransfers) : 3;

    // Queue structure: { currentStopId, steps: [], visitedStops: Set, transferCount: number }
    const queue = [];

    for (const stop of startStopCandidates) {
      queue.push({
        currentStopId: stop.stopId,
        steps: [],
        visitedStops: new Set([stop.stopId]),
        transferCount: 0
      });
    }

    for (const conn of startConnections) {
      queue.push({
        currentStopId: conn.toStopId,
        steps: [conn],
        visitedStops: new Set([conn.fromStopId, conn.toStopId]),
        transferCount: conn.connectionType === 'TRANSFER' ? 1 : 0
      });
    }

    let iterations = 0;
    const maxIterations = 80; // Guard against combinatorial explosion

    while (queue.length > 0 && iterations < maxIterations) {
      iterations++;
      const current = queue.shift();

      if (current.currentStopId === targetStopId) {
        if (current.steps.length > 0) {
          try {
            const journey = this.journeyBuilder.buildMultimodalFromNetwork(current.steps, {
              id: `cand-graph-${current.steps.map(s => s.mode).join('-')}-${depTime.replace(':', '')}-${iterations}`,
              initialDepartureTime: depTime,
              date,
              dayOfWeek,
              origin,
              destination
            });
            candidates.push(journey);
          } catch (err) {
            // Ignore invalid assembled step sequence
          }
        }
        continue;
      }

      if (current.steps.length >= maxDepth) continue;

      // Find outgoing segments and connections
      const outgoing = network.findOutgoingEdges(current.currentStopId);
      const allEdges = [...outgoing.segments, ...outgoing.connections];

      // Deterministic sort: stopSequence, mode, ID
      allEdges.sort((a, b) => {
        const seqA = a.stopSequence || 0;
        const seqB = b.stopSequence || 0;
        if (seqA !== seqB) return seqA - seqB;
        if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
        return a.id.localeCompare(b.id);
      });

      for (const edge of allEdges) {
        const nextStopId = edge.toStopId;
        if (current.visitedStops.has(nextStopId)) continue; // Avoid cycle

        // Mode constraint check
        if (Array.isArray(preferences.avoidModes) && preferences.avoidModes.includes(edge.mode)) continue;
        if (Array.isArray(preferences.allowedModes) && preferences.allowedModes.length > 0 && edge.mode !== 'walk' && !preferences.allowedModes.includes(edge.mode)) continue;

        // Transfer count check
        const isTransfer = (edge instanceof TransportConnection && edge.connectionType === 'TRANSFER') ||
          (current.steps.length > 0 && current.steps[current.steps.length - 1].mode !== 'walk' && edge.mode !== 'walk' && current.steps[current.steps.length - 1].mode !== edge.mode);

        const newTransferCount = current.transferCount + (isTransfer ? 1 : 0);
        if (newTransferCount > maxTransfers) continue;

        const nextVisited = new Set(current.visitedStops);
        nextVisited.add(nextStopId);

        queue.push({
          currentStopId: nextStopId,
          steps: [...current.steps, edge],
          visitedStops: nextVisited,
          transferCount: newTransferCount
        });
      }
    }

    return candidates;
  }

  // ==========================================================================
  // 3. HARD CONSTRAINT EVALUATION
  // ==========================================================================

  /**
   * Evaluates a candidate against all hard constraints.
   * If valid, appends to accepted list; otherwise logs violations to rejected list.
   * @private
   */
  _evaluateCandidate(journey, { preferences, constraints, targetArrivalTime }, accepted, rejected) {
    if (!journey || !(journey instanceof CommuteJourney)) {
      return;
    }

    const { routeConstraintFilteringService } = require('./routeConstraintFilteringService');
    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      preferences,
      constraints,
      targetArrivalTime
    });

    // Spatial & Chronological Integrity Check via JourneyBuilder
    const validation = this.journeyBuilder.validateJourney(journey);
    if (!validation.isValid) {
      result.isAccepted = false;
      result.status = 'REJECTED';
      for (const err of validation.errors) {
        result.violations.push({
          constraintType: 'HARD',
          reasonCode: 'CORRIDOR_CLOSED',
          message: err,
          field: 'spatialIntegrity'
        });
      }
    }

    if (result.isAccepted) {
      accepted.push(journey);
    } else {
      rejected.push({
        candidateId: journey.id,
        primaryMode: journey.primaryMode,
        violations: result.violations.map(v => v.message),
        detailedViolations: result.violations,
        reasonCodes: result.reasonCodes,
        primaryReasonCode: result.primaryReasonCode,
        journey
      });
    }
  }

  // ==========================================================================
  // 4. DEDUPLICATION & HELPERS
  // ==========================================================================

  /**
   * Deduplicates candidates using deterministic multi-attribute signature.
   * @private
   */
  _deduplicateCandidates(candidates) {
    const seen = new Set();
    const unique = [];

    for (const cand of candidates) {
      const signature = [
        cand.primaryMode,
        cand.departureTime,
        cand.estimatedArrivalTime,
        cand.totalDurationMinutes,
        cand.transferCount,
        cand.estimatedCostRupees,
        cand.modesIncluded.slice().sort().join('-')
      ].join('|');

      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(cand);
      }
    }

    return unique;
  }

  /**
   * Chains consecutive segments along a route line from origin to destination stop.
   * @private
   */
  _findSegmentChain(segments, fromStopId, toStopId) {
    const chain = [];
    let current = fromStopId;

    while (current !== toStopId) {
      const nextSeg = segments.find(s => s.fromStopId === current);
      if (!nextSeg) return []; // Broken chain
      chain.push(nextSeg);
      current = nextSeg.toStopId;
      if (chain.length > 15) return []; // Guard against infinite loop
    }

    return chain;
  }

  /**
   * Normalizes incoming parameter structure.
   * Handles both standalone options and recommendation pipeline context.
   * @private
   */
  _normalizeParams(params) {
    // Support Stage 1 context object
    const ctx = params.context || {};
    const rawOrigin = params.origin || params.startingArea || ctx.originArea || 'Lokhandwala';
    const origin = typeof rawOrigin === 'object' ? (rawOrigin.name || 'Lokhandwala') : rawOrigin;

    const rawDest = params.destination || params.collegeDestination || ctx.destinationArea || 'D.J. Sanghvi College of Engineering';
    const destination = typeof rawDest === 'object' ? (rawDest.name || 'D.J. Sanghvi College of Engineering') : rawDest;

    const departureTime = params.departureTime || params.desiredDepartureTime || ctx.desiredDepartureTime || '08:00';
    const targetArrivalTime = params.targetArrivalTime || params.desiredArrivalTime || ctx.desiredArrivalTime || null;

    const rawPrefs = params.preferences || {};
    const rawConstraints = params.constraints || ctx.constraints || {};

    const preferences = {
      allowedModes: rawPrefs.allowedModes || rawConstraints.allowedModes || null,
      avoidModes: rawPrefs.avoidModes || rawConstraints.avoidModes || null,
      preferredModes: rawPrefs.preferredModes || rawConstraints.preferredModes || null,
      routePreference: rawPrefs.routePreference || rawConstraints.routePreference || 'balanced'
    };

    const constraints = {
      maxTransfers: rawConstraints.maxTransfers !== undefined ? rawConstraints.maxTransfers : (rawPrefs.maxTransfers !== undefined ? rawPrefs.maxTransfers : null),
      maxWalkingMinutes: rawConstraints.maxWalkingMinutes !== undefined ? rawConstraints.maxWalkingMinutes : (rawPrefs.maxWalkingMinutes !== undefined ? rawPrefs.maxWalkingMinutes : null),
      maxBudgetRupees: rawConstraints.maxBudgetRupees !== undefined ? rawConstraints.maxBudgetRupees : (rawConstraints.maxFareRupees !== undefined ? rawConstraints.maxFareRupees : null),
      maxDurationMinutes: rawConstraints.maxDurationMinutes !== undefined ? rawConstraints.maxDurationMinutes : null
    };

    const date = params.date || ctx.date || 'Mon';
    const dayOfWeek = params.dayOfWeek || ctx.dayOfWeek || 'Mon';
    const options = params.options || {};

    return {
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      preferences,
      constraints,
      date,
      dayOfWeek,
      options
    };
  }

  /**
   * Estimates straight-line or road distance (km) between origin and D.J. Sanghvi College.
   * @private
   */
  _estimateDistanceKm(origin, destination) {
    const o = (origin || '').toLowerCase().trim();
    for (const [knownArea, dist] of Object.entries(KNOWN_CAMPUS_DISTANCES)) {
      if (o.includes(knownArea)) {
        return dist;
      }
    }
    return 6.0; // Standard suburban Mumbai default distance
  }

  /**
   * Checks if time1 is strictly later on the 24-hour clock than time2.
   * @private
   */
  _isLaterTime(time1, time2) {
    if (!time1 || !time2) return false;
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return (h1 * 60 + m1) > (h2 * 60 + m2);
  }

  /**
   * Checks if time1 is strictly earlier on the 24-hour clock than time2.
   * @private
   */
  _isEarlierTime(time1, time2) {
    if (!time1 || !time2) return false;
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return (h1 * 60 + m1) < (h2 * 60 + m2);
  }

  /**
   * Generates meaningful alternate routes for an affected or evaluated journey.
   *
   * @param {CommuteJourney|object} originalJourney
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {Promise<Array<object>>}
   */
  async generateAlternatesForJourney(originalJourney, context = {}, options = {}) {
    const { alternateRouteService } = require('./alternateRouteService');
    return alternateRouteService.generateAlternatesForJourney(originalJourney, context, options);
  }

  /**
   * Generates alternate candidate routes for an array of candidate journeys.
   *
   * @param {Array<CommuteJourney>} candidateJourneys
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async generateAlternatesForCandidates(candidateJourneys, context = {}, options = {}) {
    const { alternateRouteService } = require('./alternateRouteService');
    return alternateRouteService.generateAlternatesForCandidates(candidateJourneys, context, options);
  }

  /**
   * Filters candidate journeys against hard constraints and soft preferences using RouteConstraintFilteringService.
   *
   * @param {Array<CommuteJourney|object>} candidates
   * @param {object} [options={}]
   * @returns {object} { accepted, rejected, allEvaluations, summary }
   */
  filterCandidates(candidates, options = {}) {
    const { routeConstraintFilteringService } = require('./routeConstraintFilteringService');
    return routeConstraintFilteringService.filterCandidates(candidates, options);
  }

  /**
   * Compares candidate journeys in a structured, explainable way using RouteComparisonService.
   *
   * @param {Array<CommuteJourney|object>} candidates
   * @param {object|Array<object>} [contextOrImpacts={}]
   * @param {object} [options={}]
   * @returns {object} Structured comparison result
   */
  compareRoutes(candidates, contextOrImpacts = {}, options = {}) {
    const { routeComparisonService } = require('./routeComparisonService');
    return routeComparisonService.compareRoutes(candidates, contextOrImpacts, options);
  }
}

const candidateRouteEngine = new CandidateRouteEngine();

module.exports = {
  CandidateRouteEngine,
  candidateRouteEngine,
  KNOWN_CAMPUS_DISTANCES
};
