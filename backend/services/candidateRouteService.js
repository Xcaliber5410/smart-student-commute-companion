/**
 * CandidateRouteService
 *
 * Stage 4 of the Commute Recommendation Pipeline.
 * Clean abstraction for generating multimodal candidate routes connecting
 * a student's starting area and college destination.
 *
 * Design:
 * - Pluggable generator architecture allowing later integration of complex graph routing
 * - Independently testable using mock/fixture route generators
 * - Strictly produces domain-validated CommuteRoute instances
 */

const {
  CommuteRoute,
  RouteLeg,
  TravelEstimate,
  DataProvenance,
  TRANSPORT_MODES,
  LEG_TYPES
} = require('../models');
const { transportDataService } = require('./transportDataService');
const { candidateRouteEngine } = require('./candidateRouteEngine');

class CandidateRouteService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.transportDataService]
   * @param {object} [options.candidateRouteEngine]
   * @param {Function} [options.customGenerator] - Optional custom route generation strategy
   */
  constructor(options = {}) {
    this.transportDataService = options.transportDataService || transportDataService;
    this.candidateRouteEngine = options.candidateRouteEngine || candidateRouteEngine;
    this.customGenerator = options.customGenerator || null;
  }

  /**
   * Generates candidate routes for the given commute context and available transit data.
   *
   * @param {object} params
   * @param {object} params.context - Normalized CommuteContext from Stage 1
   * @param {object} [params.transportData] - Transport services and lines from Stage 2
   * @param {object} [options={}]
   * @returns {Promise<Array<CommuteRoute>>} List of candidate routes
   */
  async generateCandidates({ context, transportData = null, options = {} }) {
    // 1. Direct fixture/mock override for unit testing
    if (options.customRoutes && Array.isArray(options.customRoutes)) {
      return options.customRoutes.map(r => (r instanceof CommuteRoute ? r : new CommuteRoute(r)));
    }

    // 2. Custom generator delegation if injected
    if (this.customGenerator && typeof this.customGenerator === 'function') {
      const generated = await this.customGenerator({ context, transportData, options });
      return (generated || []).map(r => (r instanceof CommuteRoute ? r : new CommuteRoute(r)));
    }

    // 3. Delegate to Day 15 CandidateRouteEngine
    if (this.candidateRouteEngine) {
      try {
        const journeys = await this.candidateRouteEngine.generateCandidates({
          context,
          options
        });
        if (Array.isArray(journeys) && journeys.length > 0) {
          return journeys.map(j => (j instanceof CommuteRoute ? j : j.toCommuteRoute()));
        }
      } catch (err) {
        // Fall back to corridor templates if engine throws
      }
    }

    // 3. Resolve transport services if not provided
    const origin = context.originArea.name || context.originArea;
    const destination = context.destinationArea.name || context.destinationArea;

    let availableServices = transportData && transportData.services
      ? transportData.services
      : [];

    if (availableServices.length === 0 && this.transportDataService) {
      try {
        const corridor = await this.transportDataService.findCorridorServices(origin, destination);
        availableServices = corridor.services || [];
      } catch (err) {
        availableServices = [];
      }
    }

    // 4. Synthesize candidate routes based on available corridor services
    const candidates = [];
    const arrivalTime = context.desiredArrivalTime || '09:00';

    if (availableServices.length > 0) {
      for (const service of availableServices) {
        const mode = service.mode || TRANSPORT_MODES.TRAIN;
        const lineCode = service.lineCode || service.lineName || 'Line';
        const headway = service.averageHeadwayMinutes || 10;
        const baseFare = service.baseFare || 10;

        // Baseline transit route with walking access/egress
        const duration = mode === TRANSPORT_MODES.TRAIN ? 32 : (mode === TRANSPORT_MODES.METRO ? 26 : 42);
        const walkMin = 12;

        const candidate = this._createMultimodalCandidate({
          id: `cand-${service.serviceId || service.id || Math.random().toString(36).substring(2, 7)}`,
          title: `Via ${service.lineName || 'Transit Service'}`,
          summary: `${service.lineName} from ${origin} towards ${destination}`,
          primaryMode: mode,
          modesIncluded: [TRANSPORT_MODES.WALK, mode],
          origin,
          destination,
          transitLine: service.lineName,
          transitAgency: service.operatingCompany || 'Mumbai Transit',
          totalDurationMinutes: duration + walkMin,
          walkingDurationMinutes: walkMin,
          totalFareRupees: baseFare,
          departureTime: '08:15',
          arrivalTime,
          provenance: service.provenance || DataProvenance.estimated('CandidateRouteService').toJSON()
        });

        candidates.push(candidate);
      }
    }

    // 5. If no specific service matches, provide baseline template candidates
    if (candidates.length === 0) {
      candidates.push(
        this._createMultimodalCandidate({
          id: `cand-western-railway-${Date.now()}`,
          title: 'Western Railway Local (Fast/Slow)',
          summary: `Local train from ${origin} to Vile Parle / Andheri with campus walk`,
          primaryMode: TRANSPORT_MODES.TRAIN,
          modesIncluded: [TRANSPORT_MODES.WALK, TRANSPORT_MODES.TRAIN],
          origin,
          destination,
          transitLine: 'Western Railway Suburban',
          transitAgency: 'Western Railway',
          totalDurationMinutes: 38,
          walkingDurationMinutes: 14,
          totalFareRupees: 10,
          departureTime: '08:15',
          arrivalTime,
          provenance: DataProvenance.estimated('Multimodal Template Generator').toJSON()
        }),
        this._createMultimodalCandidate({
          id: `cand-metro-feeder-${Date.now()}`,
          title: 'Metro Line 1 + Auto Shuttle',
          summary: `Metro Line 1 with shared auto first/last mile connection`,
          primaryMode: TRANSPORT_MODES.METRO,
          modesIncluded: [TRANSPORT_MODES.WALK, TRANSPORT_MODES.METRO, TRANSPORT_MODES.SHARED_AUTO],
          origin,
          destination,
          transitLine: 'Metro Line 1 (Blue Line)',
          transitAgency: 'MMOPL',
          totalDurationMinutes: 30,
          walkingDurationMinutes: 6,
          totalFareRupees: 45,
          departureTime: '08:25',
          arrivalTime,
          provenance: DataProvenance.estimated('Multimodal Template Generator').toJSON()
        }),
        this._createMultimodalCandidate({
          id: `cand-best-bus-${Date.now()}`,
          title: 'Direct BEST Bus Corridor',
          summary: `Direct city bus service connecting ${origin} and ${destination}`,
          primaryMode: TRANSPORT_MODES.BUS,
          modesIncluded: [TRANSPORT_MODES.WALK, TRANSPORT_MODES.BUS],
          origin,
          destination,
          transitLine: 'BEST Route 203/256',
          transitAgency: 'BEST Undertaking',
          totalDurationMinutes: 52,
          walkingDurationMinutes: 8,
          totalFareRupees: 15,
          departureTime: '08:00',
          arrivalTime,
          provenance: DataProvenance.estimated('Multimodal Template Generator').toJSON()
        })
      );
    }

    return candidates;
  }

  /**
   * Helper to construct a standard CommuteRoute with segments and estimates.
   * @private
   */
  _createMultimodalCandidate(params) {
    const {
      id,
      title,
      summary,
      primaryMode,
      modesIncluded,
      origin,
      destination,
      transitLine,
      transitAgency,
      totalDurationMinutes,
      walkingDurationMinutes,
      totalFareRupees,
      departureTime,
      arrivalTime,
      provenance
    } = params;

    const transitMinutes = Math.max(5, totalDurationMinutes - walkingDurationMinutes);

    const legs = [
      new RouteLeg({
        legIndex: 0,
        type: LEG_TYPES.WALK,
        mode: TRANSPORT_MODES.WALK,
        from: origin,
        to: `${origin} Station / Transit Hub`,
        departureTime: '08:15',
        arrivalTime: '08:22',
        durationMinutes: Math.round(walkingDurationMinutes / 2),
        distanceKm: 0.6,
        fareRupees: 0,
        instructions: `Walk from ${origin} to station entrance`,
        provenance: DataProvenance.estimated('OSRM Pedestrian Routing').toJSON()
      }),
      new RouteLeg({
        legIndex: 1,
        type: primaryMode === TRANSPORT_MODES.AUTO ? LEG_TYPES.AUTO : LEG_TYPES.TRANSIT,
        mode: primaryMode,
        from: `${origin} Station / Transit Hub`,
        to: `${destination} Transit Station`,
        departureTime: '08:25',
        arrivalTime: '08:50',
        durationMinutes: transitMinutes,
        distanceKm: 12.0,
        fareRupees: totalFareRupees,
        lineInfo: {
          agency: transitAgency,
          lineName: transitLine,
          routeShortName: primaryMode.toUpperCase(),
          platform: 'Platform 1',
          headsign: destination
        },
        instructions: `Board ${transitLine} towards ${destination}`,
        provenance
      }),
      new RouteLeg({
        legIndex: 2,
        type: modesIncluded.includes(TRANSPORT_MODES.SHARED_AUTO) ? LEG_TYPES.SHARED_AUTO : LEG_TYPES.WALK,
        mode: modesIncluded.includes(TRANSPORT_MODES.SHARED_AUTO) ? TRANSPORT_MODES.SHARED_AUTO : TRANSPORT_MODES.WALK,
        from: `${destination} Transit Station`,
        to: destination,
        departureTime: '08:52',
        arrivalTime,
        durationMinutes: Math.max(3, walkingDurationMinutes - Math.round(walkingDurationMinutes / 2)),
        distanceKm: 0.8,
        fareRupees: modesIncluded.includes(TRANSPORT_MODES.SHARED_AUTO) ? 20 : 0,
        instructions: `Proceed from station to ${destination}`,
        provenance: DataProvenance.estimated('OSRM Routing').toJSON()
      })
    ];

    const estimate = new TravelEstimate({
      totalDurationMinutes,
      walkingDurationMinutes,
      transitDurationMinutes: transitMinutes,
      totalDistanceKm: 13.4,
      walkingDistanceKm: 1.4,
      totalFareRupees,
      transferCount: legs.filter(l => l.isTransit()).length > 1 ? 1 : 0,
      confidenceInterval: {
        minMinutes: Math.max(5, totalDurationMinutes - 5),
        maxMinutes: totalDurationMinutes + 10
      },
      provenance
    });

    return new CommuteRoute({
      id,
      title,
      summary,
      primaryMode,
      modesIncluded,
      estimate: estimate.toJSON(),
      legs: legs.map(l => l.toJSON()),
      scores: {
        compositeScore: 50,
        timeScore: 50,
        costScore: 50,
        walkingScore: 50,
        reliabilityScore: 50,
        disruptionPenalty: 0,
        weatherPenalty: 0
      },
      tags: ['multimodal', primaryMode],
      isViable: true,
      provenance
    });
  }
}

const candidateRouteService = new CandidateRouteService();

module.exports = {
  CandidateRouteService,
  candidateRouteService
};
