/**
 * TransportNetwork Domain Graph Model
 *
 * Represents the multimodal transport network graph for student commute routing (P9).
 * Composes stops, services, route segments, and transfer connections into a queryable structure.
 *
 * Enables:
 * 1. Graph traversal and outgoing edge discovery (stations, lines, transfers)
 * 2. Multimodal journey assembly (e.g. Area A → Walk → Metro → Bus Stop → Bus → College → Walk)
 * 3. Synthesis of domain-compliant CommuteRoute and RouteLeg entities for recommendation pipelines
 */

const {
  CommuteRoute,
  RouteLeg,
  TravelEstimate,
  TRANSPORT_MODES,
  LEG_TYPES,
  DataProvenance
} = require('./CommuteContracts');
const { TransportSegment } = require('./TransportSegment');
const { TransportConnection } = require('./TransportConnection');
const { TransportStop } = require('./TransportStop');
const { TransportService } = require('./TransportService');

class TransportNetwork {
  constructor(options = {}) {
    this.name = options.name || 'Mumbai Student Commute Network';
    this.stops = new Map();        // stopId -> TransportStop
    this.services = new Map();     // serviceId -> TransportService
    this.segments = [];            // TransportSegment[]
    this.connections = [];         // TransportConnection[]
  }

  addStop(stop) {
    const s = stop instanceof TransportStop ? stop : new TransportStop(stop);
    this.stops.set(s.stopId, s);
    return this;
  }

  getStop(stopId) {
    return this.stops.get(stopId) || null;
  }

  getAllStops() {
    return Array.from(this.stops.values());
  }

  addService(service) {
    const s = service instanceof TransportService ? service : new TransportService(service);
    this.services.set(s.id, s);
    return this;
  }

  getService(serviceId) {
    return this.services.get(serviceId) || null;
  }

  getAllServices() {
    return Array.from(this.services.values());
  }

  addSegment(segment) {
    const seg = segment instanceof TransportSegment ? segment : new TransportSegment(segment);
    this.segments.push(seg);
    return this;
  }

  getAllSegments() {
    return [...this.segments];
  }

  addConnection(connection) {
    const conn = connection instanceof TransportConnection ? connection : new TransportConnection(connection);
    this.connections.push(conn);
    return this;
  }

  getAllConnections() {
    return [...this.connections];
  }

  /**
   * Discovers all outgoing edges (both transit segments and transfers) from a stop or area.
   * @param {string} stopIdOrArea
   * @param {object} [options={}]
   * @returns {{ segments: TransportSegment[], connections: TransportConnection[] }}
   */
  findOutgoingEdges(stopIdOrArea, options = {}) {
    if (!stopIdOrArea) return { segments: [], connections: [] };
    const query = stopIdOrArea.toLowerCase().trim();

    const segments = this.segments.filter(s => {
      if (options.operationalOnly && !s.isOperational()) return false;
      if (options.mode && s.mode !== options.mode) return false;
      return s.fromStopId.toLowerCase() === query ||
             s.fromArea.toLowerCase().includes(query);
    });

    const connections = this.connections.filter(c => {
      if (options.operationalOnly && !c.isOperational()) return false;
      if (options.mode && c.mode !== options.mode) return false;
      return c.fromStopId.toLowerCase() === query ||
             c.fromArea.toLowerCase().includes(query);
    });

    return { segments, connections };
  }

  /**
   * Finds direct transit segments between two areas.
   * @param {string} fromArea
   * @param {string} toArea
   * @param {object} [options={}]
   * @returns {TransportSegment[]}
   */
  findDirectSegments(fromArea, toArea, options = {}) {
    const fromLower = fromArea.toLowerCase().trim();
    const toLower = toArea.toLowerCase().trim();

    return this.segments.filter(s => {
      if (options.operationalOnly && !s.isOperational()) return false;
      if (options.mode && s.mode !== options.mode) return false;
      const matchesFrom = s.fromArea.toLowerCase().includes(fromLower) || s.fromStopId.toLowerCase() === fromLower;
      const matchesTo = s.toArea.toLowerCase().includes(toLower) || s.toStopId.toLowerCase() === toLower;
      return matchesFrom && matchesTo;
    });
  }

  /**
   * Finds transfer/interchange connections originating at a given stop or area.
   * @param {string} stopIdOrArea
   * @returns {TransportConnection[]}
   */
  findInterchangeTransfers(stopIdOrArea) {
    const query = stopIdOrArea.toLowerCase().trim();
    return this.connections.filter(c => {
      if (!c.isOperational()) return false;
      return c.fromStopId.toLowerCase() === query || c.fromArea.toLowerCase().includes(query);
    });
  }

  /**
   * Constructs an assembled, validated multimodal CommuteRoute from ordered network elements.
   * Supports journeys such as:
   * Area A → Walk → Metro Station → Metro → Bus Stop → Bus → College Area → Walk
   *
   * @param {Array<TransportSegment|TransportConnection>} steps - Ordered network elements
   * @param {object} [metadata={}]
   * @returns {CommuteRoute} Fully assembled and scored-ready CommuteRoute
   */
  buildMultimodalJourney(steps, metadata = {}) {
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      throw new Error('Journey must contain at least one network segment or connection');
    }

    const legs = [];
    let totalDurationMinutes = 0;
    let walkingDurationMinutes = 0;
    let transitDurationMinutes = 0;
    let totalDistanceKm = 0;
    let walkingDistanceKm = 0;
    let totalFareRupees = 0;
    let transferCount = 0;
    const modesIncludedSet = new Set();

    let currentM = 8 * 60; // 08:00 base departure
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const depH = Math.floor((currentM / 60) % 24).toString().padStart(2, '0');
      const depM = Math.floor(currentM % 60).toString().padStart(2, '0');
      const nextM = currentM + step.durationMinutes;
      const arrH = Math.floor((nextM / 60) % 24).toString().padStart(2, '0');
      const arrM = Math.floor(nextM % 60).toString().padStart(2, '0');

      const leg = step.toRouteLeg({
        legIndex: i,
        departureTime: `${depH}:${depM}`,
        arrivalTime: `${arrH}:${arrM}`
      });
      legs.push(leg);
      currentM = nextM;

      modesIncludedSet.add(step.mode);
      totalDurationMinutes += step.durationMinutes;
      totalDistanceKm += step.distanceKm;
      totalFareRupees += (step.fareRupees || 0);

      if (step.mode === 'walk') {
        walkingDurationMinutes += step.durationMinutes;
        walkingDistanceKm += step.distanceKm;
      } else {
        transitDurationMinutes += step.durationMinutes;
      }

      // If this is a transfer/interchange connection or transition between distinct transit modes, count transfer
      if (step instanceof TransportConnection && (step.connectionType === 'TRANSFER' || step.connectionType === 'INTERCHANGE')) {
        transferCount++;
      } else if (i > 0 && steps[i - 1].mode !== 'walk' && step.mode !== 'walk' && steps[i - 1].mode !== step.mode) {
        transferCount++;
      }
    }

    const originArea = legs[0].from;
    const destinationArea = legs[legs.length - 1].to;
    const primaryMode = Array.from(modesIncludedSet).find(m => m !== 'walk') || TRANSPORT_MODES.WALK;

    const estimate = new TravelEstimate({
      totalDurationMinutes,
      walkingDurationMinutes,
      transitDurationMinutes,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      walkingDistanceKm: Number(walkingDistanceKm.toFixed(2)),
      totalFareRupees,
      transferCount,
      confidenceInterval: {
        minMinutes: Math.max(0, totalDurationMinutes - 5),
        maxMinutes: totalDurationMinutes + 10
      },
      provenance: DataProvenance.estimated('TransportNetwork Graph Engine').toJSON()
    });

    const routeId = metadata.id || `route-net-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const modesIncluded = Array.from(modesIncludedSet);

    return new CommuteRoute({
      id: routeId,
      title: metadata.title || `Multimodal Route via ${primaryMode.toUpperCase()}`,
      summary: metadata.summary || `${originArea} to ${destinationArea} via ${modesIncluded.join(' + ')}`,
      estimate,
      legs,
      scores: metadata.scores || {
        compositeScore: 85,
        timeScore: 85,
        costScore: 90,
        walkingScore: 80,
        reliabilityScore: 85,
        disruptionPenalty: 0,
        weatherPenalty: 0
      },
      tags: metadata.tags || ['multimodal', 'network-assembled'],
      primaryMode,
      modesIncluded,
      isViable: true,
      provenance: DataProvenance.estimated('TransportNetwork Graph Engine').toJSON()
    });
  }
}

module.exports = {
  TransportNetwork
};
