/**
 * TrafficService
 *
 * Deterministic Road Traffic Intelligence Engine for the Smart Student Commute Companion (P9).
 *
 * Provides:
 * 1. Prototype and contextual road traffic condition tracking with 4-tier provenance.
 * 2. Traffic context collection for Stage 1 of the Commute Recommendation Pipeline.
 * 3. Modular journey traffic impact evaluation:
 *    - Normal traffic: free flow, 0 min added delay, no impact
 *    - Moderate traffic: minor slowdown, ~6 min added road travel
 *    - Heavy traffic: dense congestion, +12 min estimated road travel
 *    - Severe traffic: gridlock, +28 min road travel, route may become impractical
 * 4. Mode-specific filtering: road modes (auto, shared_auto, bus) are affected;
 *    non-road modes (train, metro, walk) are unaffected.
 * 5. Temporal validity filtering: expired traffic conditions are ignored.
 * 6. Explicit 4-tier data provenance preservation (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 */

const {
  TrafficCondition,
  TrafficContext,
  JourneyTrafficImpact,
  TRAFFIC_LEVELS,
  TRAFFIC_LEVEL_DELAYS,
  ROAD_TRANSPORT_MODES,
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');
const { ValidationError } = require('../errors');

/**
 * Adds minutes to an HH:MM time string with 24-hour clock wrapping.
 * @param {string} timeStr - 'HH:MM'
 * @param {number} minutesToAdd
 * @returns {string} - 'HH:MM'
 */
function addMinutesToHHMM(timeStr, minutesToAdd) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return '08:00';
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + Math.round(minutesToAdd)) % 1440;
  const wrapped = total < 0 ? total + 1440 : total;
  const newH = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const newM = (wrapped % 60).toString().padStart(2, '0');
  return `${newH}:${newM}`;
}

// Known Mumbai road corridors and connected transit areas
const CORRIDOR_AREAS = Object.freeze({
  'sv road': ['andheri', 'vile parle', 'santacruz', 'khar', 'bandra', 'jogeshwari', 'goregaon', 'irla'],
  'link road': ['lokhandwala', 'versova', 'andheri west', 'dn nagar', 'oshiwara', 'juhu circle'],
  'western express highway': ['borivali', 'kandivali', 'malad', 'goregaon', 'jogeshwari', 'andheri', 'vile parle', 'santacruz', 'bandra'],
  'milan subway': ['santacruz', 'vile parle', 'sv road'],
  'juhu': ['juhu', 'juhu circle', 'vile parle', 'andheri west', 'irla']
});

class TrafficService {
  constructor(options = {}) {
    this.conditions = new Map();
    if (options.seedInitial !== false) {
      this.seedPrototypeTrafficConditions();
    }
  }

  /**
   * Seeds realistic prototype traffic conditions illustrating all 4 provenance tiers.
   * @param {number} [currentTime=Date.now()]
   */
  seedPrototypeTrafficConditions(currentTime = Date.now()) {
    const duration2h = 2 * 60 * 60 * 1000;
    const duration4h = 4 * 60 * 60 * 1000;

    const seedConditions = [
      // 1. VERIFIED: Mumbai Traffic Police Official Advisory (Western Express Highway)
      new TrafficCondition({
        id: 'traf-seed-weh-congestion',
        area: 'Western Express Highway',
        level: TRAFFIC_LEVELS.MODERATE,
        expectedDelayMinutes: 8,
        description: 'Moderate vehicular congestion on Western Express Highway southbound toward Santacruz',
        affectedModes: ['auto', 'shared_auto', 'bus'],
        startTime: currentTime - 15 * 60 * 1000,
        expiryTime: currentTime + duration4h,
        confidence: 'HIGH',
        provenance: DataProvenance.verified(
          'Mumbai Traffic Police Advisory',
          'Official peak hour traffic control bulletin',
          'HIGH'
        ).toJSON(),
        createdAt: currentTime
      }),

      // 2. USER_REPORTED: Community crowdsourced SV Road bottleneck
      new TrafficCondition({
        id: 'traf-seed-sv-road-heavy',
        area: 'SV Road',
        level: TRAFFIC_LEVELS.HEAVY,
        expectedDelayMinutes: 12,
        description: 'Heavy traffic congestion on SV Road between Andheri West and Vile Parle / Irla (+12 min delay)',
        affectedModes: ['auto', 'shared_auto', 'bus'],
        startTime: currentTime - 20 * 60 * 1000,
        expiryTime: currentTime + duration2h,
        confidence: 'MEDIUM',
        provenance: DataProvenance.userReported(
          'Community Commuter Feed',
          'Multiple student driver reports on SV Road',
          'MEDIUM'
        ).toJSON(),
        createdAt: currentTime
      }),

      // 3. ESTIMATED: Sensor / GPS travel time density heuristic
      new TrafficCondition({
        id: 'traf-seed-milan-subway',
        area: 'Milan Subway',
        level: TRAFFIC_LEVELS.SEVERE,
        expectedDelayMinutes: 28,
        description: 'Severe traffic gridlock at Milan Subway underpass due to heavy vehicle volume; route impractical',
        affectedModes: ['auto', 'shared_auto', 'bus'],
        startTime: currentTime - 10 * 60 * 1000,
        expiryTime: currentTime + duration2h,
        confidence: 'HIGH',
        provenance: DataProvenance.estimated(
          'Road Sensor Density Heuristic',
          'Estimated road delay based on real-time vehicle speed probes',
          'HIGH'
        ).toJSON(),
        createdAt: currentTime
      }),

      // 4. SYNTHETIC: Prototype rush-hour model for Link Road
      new TrafficCondition({
        id: 'traf-seed-link-road',
        area: 'Link Road',
        level: TRAFFIC_LEVELS.MODERATE,
        expectedDelayMinutes: 6,
        description: 'Moderate morning rush traffic simulated on Link Road between Lokhandwala and Juhu Circle',
        affectedModes: ['auto', 'shared_auto', 'bus'],
        startTime: currentTime - 5 * 60 * 1000,
        expiryTime: currentTime + duration2h,
        confidence: 'MEDIUM',
        provenance: DataProvenance.synthetic(
          'Rush-Hour Road Congestion Model',
          'Synthetic peak traffic model for Western Suburbs',
          'MEDIUM'
        ).toJSON(),
        createdAt: currentTime
      })
    ];

    for (const cond of seedConditions) {
      this.conditions.set(cond.id, cond);
    }

    return seedConditions.length;
  }

  /**
   * Registers a new or updated traffic condition.
   * @param {TrafficCondition|object} condition
   * @returns {TrafficCondition}
   */
  recordTrafficCondition(condition) {
    const entity = condition instanceof TrafficCondition
      ? condition
      : TrafficCondition.create(condition);
    this.conditions.set(entity.id, entity);
    return entity;
  }

  /**
   * Clears in-memory traffic conditions (useful for test isolation).
   */
  clearConditions() {
    this.conditions.clear();
  }

  /**
   * Retrieves active, non-expired traffic conditions.
   * @param {object} [options={}]
   * @returns {TrafficCondition[]}
   */
  getActiveConditions(options = {}) {
    const currentTime = options.currentTime || Date.now();
    const active = [];

    for (const cond of this.conditions.values()) {
      if (!cond.isExpired(currentTime) && cond.isActive(currentTime)) {
        active.push(cond);
      }
    }

    return active;
  }

  /**
   * Retrieves active traffic conditions impacting an origin, destination, or corridor.
   * @param {string} originArea
   * @param {string} destinationArea
   * @param {object} [options={}]
   * @returns {TrafficCondition[]}
   */
  getConditionsForCorridor(originArea, destinationArea, options = {}) {
    const active = this.getActiveConditions(options);
    const cleanOrig = String(originArea || '').toLowerCase().trim();
    const cleanDest = String(destinationArea || '').toLowerCase().trim();

    return active.filter(cond => {
      return this._isCorridorMatch(cond.area, cleanOrig, cleanDest);
    });
  }

  /**
   * Generates a normalized TrafficContext object for a given origin and destination.
   * Used in Stage 1 context collection by CommuteContextService.
   *
   * @param {string} originArea
   * @param {string} destinationArea
   * @param {object} [options={}]
   * @returns {Promise<TrafficContext>}
   */
  async getTrafficContext(originArea, destinationArea, options = {}) {
    const conditions = this.getConditionsForCorridor(originArea, destinationArea, options);

    if (conditions.length === 0) {
      return TrafficContext.normal(options);
    }

    // Determine highest traffic level
    let highestLevel = TRAFFIC_LEVELS.NORMAL;
    let maxDelay = 0;
    const advisories = [];
    const tiers = new Set();

    const levelRank = {
      [TRAFFIC_LEVELS.NORMAL]: 0,
      [TRAFFIC_LEVELS.MODERATE]: 1,
      [TRAFFIC_LEVELS.HEAVY]: 2,
      [TRAFFIC_LEVELS.SEVERE]: 3
    };

    for (const c of conditions) {
      if (levelRank[c.level] > levelRank[highestLevel]) {
        highestLevel = c.level;
      }
      maxDelay = Math.max(maxDelay, c.expectedDelayMinutes);
      if (c.description) {
        advisories.push(c.description);
      }
      if (c.provenance?.sourceTier) {
        tiers.add(c.provenance.sourceTier);
      }
    }

    const dataTiers = Array.from(tiers);
    let overallTier = PROVENANCE_TIERS.VERIFIED;
    if (dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED)) {
      overallTier = PROVENANCE_TIERS.USER_REPORTED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.ESTIMATED)) {
      overallTier = PROVENANCE_TIERS.ESTIMATED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC)) {
      overallTier = PROVENANCE_TIERS.SYNTHETIC;
    }

    const advisory = advisories.length > 0
      ? advisories.join(' • ')
      : `${highestLevel.toUpperCase()} road traffic along corridor (+${maxDelay}m expected delay)`;

    return new TrafficContext({
      level: highestLevel,
      expectedDelayMinutes: maxDelay,
      advisory,
      conditions: conditions.map(c => c.toJSON()),
      provenance: DataProvenance[overallTier.toLowerCase() || 'estimated'](
        'Traffic Context Engine',
        `Corridor traffic assessed across ${conditions.length} condition(s)`
      ).toJSON(),
      evaluatedAt: options.currentTime || Date.now()
    });
  }

  /**
   * Evaluates the impact of traffic conditions on an individual candidate journey.
   *
   * Rules:
   * - Non-road modes (train, metro, walk) are unaffected (0 min delay).
   * - Road modes (auto, shared_auto, bus) are affected by active traffic conditions.
   * - Normal traffic: 0 min added delay, no impact.
   * - Moderate traffic: ~6 min added road travel.
   * - Heavy traffic: +12 min estimated road travel.
   * - Severe traffic: +28 min road travel; route marked impractical.
   * - Expired traffic conditions are ignored.
   *
   * @param {object} journey - CommuteJourney or route candidate
   * @param {Array<TrafficCondition|object>} [trafficConditions=null]
   * @param {object} [options={}]
   * @returns {JourneyTrafficImpact}
   */
  evaluateJourneyTrafficImpact(journey, trafficConditions = null, options = {}) {
    if (!journey) {
      throw new ValidationError('Journey is required to evaluate traffic impact');
    }

    const currentTime = options.currentTime || Date.now();

    // Resolve conditions: provided array or active store conditions
    let candidateConditions = trafficConditions;
    if (!candidateConditions) {
      candidateConditions = this.getActiveConditions({ currentTime });
    }

    const segments = journey.segments || journey.legs || [];
    const originalDuration = Number(journey.totalDurationMinutes || journey.durationMinutes || 0);

    const segmentImpacts = [];
    const affectedSegmentIndices = [];
    let totalAddedDelay = 0;
    let highestLevel = TRAFFIC_LEVELS.NORMAL;
    const advisories = [];
    const tiers = new Set();

    const levelRank = {
      [TRAFFIC_LEVELS.NORMAL]: 0,
      [TRAFFIC_LEVELS.MODERATE]: 1,
      [TRAFFIC_LEVELS.HEAVY]: 2,
      [TRAFFIC_LEVELS.SEVERE]: 3
    };

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segMode = String(seg.mode || '').toLowerCase();
      const segIndex = seg.segmentIndex !== undefined ? seg.segmentIndex : i;
      const isRoadMode = ROAD_TRANSPORT_MODES.includes(segMode);

      // Non-road modes (train, metro, walk) are completely immune to vehicular road traffic
      if (!isRoadMode) {
        segmentImpacts.push({
          segmentIndex: segIndex,
          mode: segMode,
          isRoadMode: false,
          isAffected: false,
          trafficLevel: TRAFFIC_LEVELS.NORMAL,
          addedDelayMinutes: 0,
          condition: null,
          provenance: null
        });
        continue;
      }

      // Find matching, non-expired traffic conditions for this road segment
      const segFrom = String(seg.from || '').toLowerCase().trim();
      const segTo = String(seg.to || '').toLowerCase().trim();

      const matchingConditions = candidateConditions.filter(cond => {
        const c = cond instanceof TrafficCondition ? cond : new TrafficCondition(cond);
        if (c.isExpired(currentTime)) return false;
        if (!c.affectsMode(segMode)) return false;
        return this._isCorridorMatch(c.area, segFrom, segTo);
      });

      if (matchingConditions.length === 0) {
        segmentImpacts.push({
          segmentIndex: segIndex,
          mode: segMode,
          isRoadMode: true,
          isAffected: false,
          trafficLevel: TRAFFIC_LEVELS.NORMAL,
          addedDelayMinutes: 0,
          condition: null,
          provenance: null
        });
        continue;
      }

      // Pick dominant condition for this road segment
      let dominantCondition = matchingConditions[0];
      for (const mc of matchingConditions) {
        const c = mc instanceof TrafficCondition ? mc : new TrafficCondition(mc);
        if (levelRank[c.level] > levelRank[dominantCondition.level]) {
          dominantCondition = c;
        }
      }

      const domCond = dominantCondition instanceof TrafficCondition
        ? dominantCondition
        : new TrafficCondition(dominantCondition);

      const delayMinutes = domCond.expectedDelayMinutes !== undefined
        ? Number(domCond.expectedDelayMinutes)
        : (TRAFFIC_LEVEL_DELAYS[domCond.level] || 0);

      const isSegAffected = delayMinutes > 0 && domCond.level !== TRAFFIC_LEVELS.NORMAL;

      if (isSegAffected) {
        affectedSegmentIndices.push(segIndex);
        totalAddedDelay += delayMinutes;

        if (levelRank[domCond.level] > levelRank[highestLevel]) {
          highestLevel = domCond.level;
        }

        if (domCond.description && !advisories.includes(domCond.description)) {
          advisories.push(domCond.description);
        }

        if (domCond.provenance?.sourceTier) {
          tiers.add(domCond.provenance.sourceTier);
        }
      }

      segmentImpacts.push({
        segmentIndex: segIndex,
        mode: segMode,
        isRoadMode: true,
        isAffected: isSegAffected,
        trafficLevel: domCond.level,
        addedDelayMinutes: delayMinutes,
        condition: domCond.toJSON(),
        provenance: typeof domCond.provenance.toJSON === 'function' ? domCond.provenance.toJSON() : domCond.provenance
      });
    }

    const isAffected = affectedSegmentIndices.length > 0;
    const isImpractical = highestLevel === TRAFFIC_LEVELS.SEVERE || totalAddedDelay >= 25;
    const impracticalReason = isImpractical
      ? `Severe road traffic congestion (+${totalAddedDelay} min delay) makes road journey impractical`
      : null;

    const updatedDurationMinutes = originalDuration + totalAddedDelay;

    // Aggregate provenance
    const dataTiers = Array.from(tiers);
    let overallTier = PROVENANCE_TIERS.VERIFIED;
    if (dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED)) {
      overallTier = PROVENANCE_TIERS.USER_REPORTED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.ESTIMATED)) {
      overallTier = PROVENANCE_TIERS.ESTIMATED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC)) {
      overallTier = PROVENANCE_TIERS.SYNTHETIC;
    }

    const overallProvenance = isAffected
      ? {
          sourceTier: overallTier,
          provider: 'Traffic Impact Engine',
          confidence: 'MEDIUM',
          lastUpdated: currentTime,
          description: `Traffic impact assessed across tiers: ${dataTiers.join(', ')}`
        }
      : DataProvenance.verified('Traffic Impact Engine', 'Free-flow traffic conditions').toJSON();

    return new JourneyTrafficImpact({
      journeyId: journey.id || `journey-${Date.now()}`,
      isAffected,
      trafficLevel: highestLevel,
      addedTravelTimeMinutes: totalAddedDelay,
      originalDurationMinutes: originalDuration,
      updatedDurationMinutes,
      isImpractical,
      impracticalReason,
      affectedSegmentsCount: affectedSegmentIndices.length,
      affectedSegmentIndices,
      segmentImpacts,
      advisories,
      dataTiers: isAffected ? dataTiers : [PROVENANCE_TIERS.VERIFIED],
      provenance: overallProvenance,
      evaluatedAt: currentTime
    });
  }

  /**
   * Applies traffic impact to produce an updated journey clone/view.
   *
   * @param {object} journey
   * @param {JourneyTrafficImpact} trafficImpact
   * @returns {object}
   */
  applyTrafficImpactToJourney(journey, trafficImpact) {
    if (!journey || !trafficImpact) return journey;

    const originalArrivalTime = journey.estimatedArrivalTime || '08:30';
    const updatedArrivalTime = addMinutesToHHMM(originalArrivalTime, trafficImpact.addedTravelTimeMinutes);

    const updatedSegments = (journey.segments || []).map((seg, idx) => {
      const segImpact = trafficImpact.segmentImpacts?.find(s => s.segmentIndex === idx);
      if (!segImpact || !segImpact.isAffected) {
        return seg;
      }
      const updatedDuration = Number(seg.durationMinutes || 0) + segImpact.addedDelayMinutes;

      return {
        ...seg,
        durationMinutes: updatedDuration,
        status: trafficImpact.isImpractical ? 'DISRUPTED' : seg.status
      };
    });

    const mergedAdvisories = Array.from(new Set([...(journey.advisories || []), ...(trafficImpact.advisories || [])]));

    return {
      ...journey,
      estimatedArrivalTime: updatedArrivalTime,
      totalDurationMinutes: trafficImpact.updatedDurationMinutes,
      isViable: journey.isViable && !trafficImpact.isImpractical,
      advisories: mergedAdvisories,
      segments: updatedSegments,
      trafficImpact: trafficImpact.toJSON ? trafficImpact.toJSON() : trafficImpact
    };
  }

  /**
   * Checks whether a traffic condition area matches segment endpoints or corridor.
   * @private
   */
  _isCorridorMatch(conditionArea, fromLocation, toLocation) {
    if (!conditionArea) return true;
    const cleanArea = String(conditionArea).toLowerCase().trim();
    const cleanFrom = String(fromLocation || '').toLowerCase().trim();
    const cleanTo = String(toLocation || '').toLowerCase().trim();

    // Direct containment
    if (cleanFrom.includes(cleanArea) || cleanTo.includes(cleanArea) || cleanArea.includes(cleanFrom) || cleanArea.includes(cleanTo)) {
      return true;
    }

    // Hyphenated corridor endpoints check (e.g. "Andheri West - Vile Parle")
    const corridorParts = cleanArea.split(/[-–—]|\bto\b/).map(p => p.trim()).filter(p => p.length >= 3);
    if (corridorParts.length >= 2) {
      if (
        (cleanFrom.includes(corridorParts[0]) && cleanTo.includes(corridorParts[1])) ||
        (cleanFrom.includes(corridorParts[1]) && cleanTo.includes(corridorParts[0])) ||
        cleanFrom.includes(corridorParts[0]) || cleanTo.includes(corridorParts[1]) ||
        cleanFrom.includes(corridorParts[1]) || cleanTo.includes(corridorParts[0])
      ) {
        return true;
      }
    }

    // Check known Mumbai road corridors (e.g. "sv road", "link road", "milan subway")
    for (const [corridorKey, areas] of Object.entries(CORRIDOR_AREAS)) {
      if (cleanArea.includes(corridorKey)) {
        const fromInCorridor = areas.some(a => cleanFrom.includes(a));
        const toInCorridor = areas.some(a => cleanTo.includes(a));
        if (fromInCorridor || toInCorridor) {
          return true;
        }
      }
    }

    return false;
  }
}

const trafficService = new TrafficService();

module.exports = {
  TrafficService,
  trafficService,
  addMinutesToHHMM,
  CORRIDOR_AREAS
};
