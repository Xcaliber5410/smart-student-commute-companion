/**
 * TransportNetworkService
 *
 * Provides business-level transit graph navigation, journey assembly, and corridor lookup
 * for the Commute Recommendation Pipeline and Route Engine (P9).
 *
 * Enables:
 * - Graph traversal of multimodal options and transfers
 * - Realistic journey synthesis:
 *   Area A → Walk → Metro Station → Metro → Bus Stop → Bus → College Area → Walk
 * - Calculation of total travel time, walking distance, fares, and transfer count
 * - Status and disruption awareness
 */

const {
  transportNetworkRepository
} = require('../repositories/TransportNetworkRepository');
const {
  TransportNetwork
} = require('../models/TransportNetwork');
const {
  TRANSPORT_MODES
} = require('../models/CommuteContracts');

class TransportNetworkService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.networkRepo]
   */
  constructor(options = {}) {
    this.networkRepo = options.networkRepo || transportNetworkRepository;
    this._cachedNetwork = null;
  }

  /**
   * Retrieves or loads the in-memory multimodal transport network graph.
   * @param {object} [options={}]
   * @returns {TransportNetwork}
   */
  getNetwork(options = {}) {
    if (!this._cachedNetwork || options.refresh) {
      this._cachedNetwork = this.networkRepo.loadNetwork(options);
    }
    return this._cachedNetwork;
  }

  /**
   * Discovers outgoing transit segments and transfer connections from a stop or area.
   * @param {string} stopIdOrArea
   * @param {object} [options={}]
   * @returns {{ segments: Array, connections: Array }}
   */
  getOutgoingOptions(stopIdOrArea, options = {}) {
    const network = this.getNetwork();
    return network.findOutgoingEdges(stopIdOrArea, options);
  }

  /**
   * Finds direct transit segments connecting two coarse areas.
   * @param {string} fromArea
   * @param {string} toArea
   * @param {object} [options={}]
   * @returns {Array} List of matching TransportSegments
   */
  getDirectCorridorSegments(fromArea, toArea, options = {}) {
    const network = this.getNetwork();
    return network.findDirectSegments(fromArea, toArea, options);
  }

  /**
   * Finds transfer connections available at a transit hub.
   * @param {string} stopIdOrArea
   * @returns {Array} List of matching TransportConnections
   */
  getTransfersAt(stopIdOrArea) {
    const network = this.getNetwork();
    return network.findInterchangeTransfers(stopIdOrArea);
  }

  /**
   * Assembles an ordered array of network segments and connections into a domain CommuteRoute.
   * @param {Array} steps - Ordered list of TransportSegment / TransportConnection instances
   * @param {object} [metadata={}]
   * @returns {CommuteRoute}
   */
  assembleJourney(steps, metadata = {}) {
    const network = this.getNetwork();
    return network.buildMultimodalJourney(steps, metadata);
  }

  /**
   * Synthesizes a realistic multimodal journey as required by the Problem Statement:
   *
   *   Area A
   *   → Walk
   *   → Metro Station
   *   → Metro
   *   → Bus Stop
   *   → Bus
   *   → College Area
   *   → Walk
   *
   * @param {object} [options={}]
   * @returns {CommuteRoute}
   */
  synthesizeRealisticJourney(options = {}) {
    const network = this.getNetwork({ refresh: true });

    // Step 1: Walk from Area A (Lokhandwala) to Metro Versova
    const walkToMetro = network.getAllConnections().find(c => c.id === 'conn-walk-area-a-to-metro') ||
      network.getAllConnections().find(c => c.fromArea.toLowerCase().includes('lokhandwala') || c.toStopId === 'METRO_VERSOVA');

    // Step 2: Metro from Versova to DN Nagar
    const metroSegment = network.getAllSegments().find(s => s.id === 'seg-metro-versova-dnnagar') ||
      network.getAllSegments().find(s => s.mode === TRANSPORT_MODES.METRO && s.toStopId === 'METRO_DNNAGAR');

    // Step 3: Transfer Walk from DN Nagar Metro to Bus Stop
    const walkToBus = network.getAllConnections().find(c => c.id === 'conn-walk-metro-to-bus-stop') ||
      network.getAllConnections().find(c => c.fromStopId === 'METRO_DNNAGAR' && c.toStopId.includes('BUS'));

    // Step 4: Bus from DN Nagar / Andheri to Juhu / College Area
    const busSegment = network.getAllSegments().find(s => s.id === 'seg-bus-juhu-djsanghvi') ||
      network.getAllSegments().find(s => s.mode === TRANSPORT_MODES.BUS);

    // Step 5: Walk from Bus Stop to College Campus
    const walkToCollege = network.getAllConnections().find(c => c.id === 'conn-walk-bus-to-college') ||
      network.getAllConnections().find(c => c.toStopId === 'COLLEGE_DJS' && c.mode === 'walk');

    const steps = [
      walkToMetro,
      metroSegment,
      walkToBus,
      busSegment,
      walkToCollege
    ].filter(Boolean);

    if (steps.length === 0) {
      throw new Error('Unable to synthesize multimodal journey: required network steps not found');
    }

    return network.buildMultimodalJourney(steps, {
      id: options.id || `route-multimodal-realistic-${Date.now()}`,
      title: options.title || 'Metro + Bus Multimodal Commute to D.J. Sanghvi',
      summary: options.summary || 'Walk to Metro → Metro Line 1 → Walk to Bus Stop → BEST Bus → Walk to Campus',
      advisories: ['Interchange required between Metro DN Nagar and BEST feeder stop']
    });
  }

  /**
   * Updates segment status (e.g. when disruption occurs).
   * @param {string} segmentId
   * @param {'ACTIVE'|'INACTIVE'|'DISRUPTED'|'SUSPENDED'} status
   * @returns {TransportSegment|null}
   */
  updateSegmentStatus(segmentId, status) {
    const seg = this.networkRepo.getSegmentById(segmentId);
    if (!seg) return null;
    seg.status = status;
    seg.updatedAt = Date.now();
    const updated = this.networkRepo.saveSegment(seg);
    this._cachedNetwork = null; // Invalidate cache
    return updated;
  }
}

const transportNetworkService = new TransportNetworkService();

module.exports = {
  TransportNetworkService,
  transportNetworkService
};
