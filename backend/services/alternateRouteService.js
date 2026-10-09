/**
 * AlternateRouteService
 *
 * Generates meaningful, diverse, and feasible alternate commute journeys
 * when candidate journeys are affected by contextual disruptions, road traffic,
 * adverse weather, or service unavailability.
 *
 * Supported Alternate Strategies:
 * 1. Bus instead of affected train/metro (BUS_INSTEAD_OF_TRAIN)
 * 2. Train/metro instead of affected road transport (TRAIN_INSTEAD_OF_ROAD / METRO_INSTEAD_OF_ROAD)
 * 3. Different transport service / line (LINE_SUBSTITUTION)
 * 4. Different transfer point (TRANSFER_CHANGE)
 * 5. Earlier / later departure where timetable data supports it (SCHEDULE_SHIFT)
 * 6. Reasonable walking adjustment (WALK_ADJUSTMENT)
 * 7. Different valid multimodal combination (MULTIMODAL_COMBINATION)
 *
 * Invariants:
 * - Uses existing transport network, timetable, journey builder, and candidate generator.
 * - Does NOT fabricate real-world transport data.
 * - Every alternate has valid travel estimates, preserves 4-tier provenance,
 *   identifies affected/unavailable segments, and is checked for feasibility.
 * - Every alternate contains a human-readable explanation of why it differs from the original.
 * - Prevents duplicate or effectively identical routes.
 */

const {
  CommuteJourney,
  TRANSPORT_MODES,
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');
const { candidateRouteEngine } = require('./candidateRouteEngine');
const { commuteContextEngine } = require('./commuteContextEngine');
const { transportScheduleService } = require('./transportScheduleService');
const { transportNetworkService } = require('./transportNetworkService');
const { journeyBuilderService } = require('./journeyBuilderService');
const { ValidationError } = require('../errors');

const ALTERNATE_STRATEGY_TYPES = Object.freeze({
  BUS_INSTEAD_OF_TRAIN: 'BUS_INSTEAD_OF_TRAIN',
  TRAIN_INSTEAD_OF_ROAD: 'TRAIN_INSTEAD_OF_ROAD',
  METRO_INSTEAD_OF_ROAD: 'METRO_INSTEAD_OF_ROAD',
  MODE_SHIFT: 'MODE_SHIFT',
  LINE_SUBSTITUTION: 'LINE_SUBSTITUTION',
  TRANSFER_CHANGE: 'TRANSFER_CHANGE',
  SCHEDULE_SHIFT: 'SCHEDULE_SHIFT',
  WALK_ADJUSTMENT: 'WALK_ADJUSTMENT',
  MULTIMODAL_COMBINATION: 'MULTIMODAL_COMBINATION'
});

class AlternateRouteService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.candidateRouteEngine]
   * @param {object} [options.commuteContextEngine]
   * @param {object} [options.scheduleService]
   * @param {object} [options.networkService]
   * @param {object} [options.journeyBuilder]
   */
  constructor(options = {}) {
    this.candidateEngine = options.candidateRouteEngine || candidateRouteEngine;
    this.contextEngine = options.commuteContextEngine || commuteContextEngine;
    this.scheduleService = options.scheduleService || transportScheduleService;
    this.networkService = options.networkService || transportNetworkService;
    this.journeyBuilder = options.journeyBuilder || journeyBuilderService;
  }

  /**
   * Generates meaningful alternate routes for an affected or evaluated journey.
   *
   * @param {CommuteJourney|object} originalJourney - Original candidate journey
   * @param {object} [context={}] - Stage 1/2 commute context (disruptions, traffic, weather, availability)
   * @param {object} [options={}] - Search controls and constraints
   * @returns {Promise<Array<object>>} List of enriched alternate route descriptor objects
   */
  async generateAlternatesForJourney(originalJourney, context = {}, options = {}) {
    if (!originalJourney) {
      throw new ValidationError('Original journey is required to generate alternate routes');
    }

    // 1. Evaluate original journey impact to understand what is affected
    const originalImpact = this.contextEngine.evaluateJourney(originalJourney, context, options);

    const origin = originalJourney.origin;
    const destination = originalJourney.destination;
    const originalDeparture = originalJourney.departureTime || '08:00';
    const targetArrivalTime = options.targetArrivalTime || originalJourney.estimatedArrivalTime;
    const constraints = options.constraints || {};
    const preferences = options.preferences || {};
    const date = options.date || 'Mon';
    const dayOfWeek = options.dayOfWeek || 'Mon';

    const rawAlternates = [];

    // Identify affected attributes
    const isRailAffected = originalJourney.modesIncluded.some(m => m === 'train' || m === 'metro') &&
      (originalImpact.disruptionImpact?.isAffected || originalImpact.affectedSegments.some(s => s.mode === 'train' || s.mode === 'metro') || originalImpact.unavailableSegments.some(s => s.mode === 'train' || s.mode === 'metro'));

    const hasRoadTrafficDelay = (originalImpact.trafficImpact?.addedTravelTimeMinutes || 0) > 0 ||
      (context.trafficConditions && context.trafficConditions.length > 0 && originalJourney.modesIncluded.some(m => m === 'auto' || m === 'bus' || m === 'shared_auto'));
    const isRoadAffected = hasRoadTrafficDelay;

    const isServiceUnavailable = !originalImpact.isFeasible || originalImpact.unavailableSegments.length > 0 ||
      (context.availabilityRecords && context.availabilityRecords.length > 0);
    const hasDelay = (originalImpact.totalAdditionalDelayMinutes || 0) > 0;

    // ------------------------------------------------------------------------
    // STRATEGY 1: BUS INSTEAD OF AFFECTED TRAIN / METRO
    // ------------------------------------------------------------------------
    if (isRailAffected || (originalJourney.primaryMode === 'train' && (hasDelay || isServiceUnavailable))) {
      const busCandidates = this.candidateEngine._buildDirectBusCandidates({
        origin,
        destination,
        departureTime: originalDeparture,
        date,
        dayOfWeek,
        network: this.networkService.getNetwork()
      });

      for (const cand of busCandidates) {
        if (this._isSubstantivelyDifferent(originalJourney, cand)) {
          rawAlternates.push({
            journey: cand,
            strategyType: ALTERNATE_STRATEGY_TYPES.BUS_INSTEAD_OF_TRAIN,
            reasonSummary: `Switches from affected rail transport to BEST Bus 201 corridor to bypass rail disruption.`,
            avoidedImpacts: ['rail_disruption', 'rail_suspension']
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 2: TRAIN / METRO INSTEAD OF AFFECTED ROAD TRANSPORT
    // ------------------------------------------------------------------------
    if (hasRoadTrafficDelay && !isServiceUnavailable) {
      // 2a. Suburban Train Corridor
      const trainCandidates = this.candidateEngine._buildTrainCandidates({
        origin,
        destination,
        departureTime: originalDeparture,
        date,
        dayOfWeek,
        network: this.networkService.getNetwork()
      });

      for (const cand of trainCandidates) {
        if (this._isSubstantivelyDifferent(originalJourney, cand)) {
          rawAlternates.push({
            journey: cand,
            strategyType: ALTERNATE_STRATEGY_TYPES.TRAIN_INSTEAD_OF_ROAD,
            reasonSummary: `Switches from road transport to grade-separated Western Railway suburban train to bypass surface road traffic congestion.`,
            avoidedImpacts: ['road_traffic_congestion', 'road_bottleneck']
          });
        }
      }

      // 2b. Metro Line 1
      const metroBusCandidates = this.candidateEngine._buildMetroBusCandidates({
        origin,
        destination,
        departureTime: originalDeparture,
        date,
        dayOfWeek,
        network: this.networkService.getNetwork()
      });

      for (const cand of metroBusCandidates) {
        if (this._isSubstantivelyDifferent(originalJourney, cand)) {
          rawAlternates.push({
            journey: cand,
            strategyType: ALTERNATE_STRATEGY_TYPES.METRO_INSTEAD_OF_ROAD,
            reasonSummary: `Switches to elevated Metro Line 1 corridor to bypass surface road congestion.`,
            avoidedImpacts: ['road_traffic_congestion']
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 3: DIFFERENT TRANSPORT SERVICE / LINE SUBSTITUTION
    // ------------------------------------------------------------------------
    if (isServiceUnavailable) {
      // If BEST Bus is down, try Metro or Train
      if (originalJourney.modesIncluded.includes('bus')) {
        const trainAlt = this.candidateEngine._buildTrainCandidates({
          origin,
          destination,
          departureTime: originalDeparture,
          date,
          dayOfWeek,
          network: this.networkService.getNetwork()
        });
        for (const cand of trainAlt) {
          if (this._isSubstantivelyDifferent(originalJourney, cand)) {
            rawAlternates.push({
              journey: cand,
              strategyType: ALTERNATE_STRATEGY_TYPES.LINE_SUBSTITUTION,
              reasonSummary: `Substitutes disrupted bus route with Western Railway suburban train line.`,
              avoidedImpacts: ['service_unavailability']
            });
          }
        }
      }

      // If Western Railway is down, try Metro Line 1 + Bus
      if (originalJourney.modesIncluded.includes('train')) {
        const metroAlt = this.candidateEngine._buildMetroBusCandidates({
          origin,
          destination,
          departureTime: originalDeparture,
          date,
          dayOfWeek,
          network: this.networkService.getNetwork()
        });
        for (const cand of metroAlt) {
          if (this._isSubstantivelyDifferent(originalJourney, cand)) {
            rawAlternates.push({
              journey: cand,
              strategyType: ALTERNATE_STRATEGY_TYPES.LINE_SUBSTITUTION,
              reasonSummary: `Substitutes Western Railway line with Metro Line 1 multimodal connection.`,
              avoidedImpacts: ['service_unavailability']
            });
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 4: DIFFERENT TRANSFER POINT
    // ------------------------------------------------------------------------
    const originalTransfers = originalJourney.segments.filter(s => s.isWalking() && s.segmentIndex > 0 && s.segmentIndex < originalJourney.segments.length - 1);
    const usesAndheriTransfer = originalJourney.segments.some(s => s.from?.toLowerCase().includes('andheri') || s.to?.toLowerCase().includes('andheri'));

    if (usesAndheriTransfer || originalTransfers.length > 0) {
      // If original transfers at Andheri, try alternative transfer at Vile Parle Station or DN Nagar
      const metroAutoCand = this.candidateEngine._buildMetroAutoCandidates({
        origin,
        destination,
        departureTime: originalDeparture,
        date,
        dayOfWeek,
        network: this.networkService.getNetwork()
      });

      for (const cand of metroAutoCand) {
        if (this._isSubstantivelyDifferent(originalJourney, cand)) {
          rawAlternates.push({
            journey: cand,
            strategyType: ALTERNATE_STRATEGY_TYPES.TRANSFER_CHANGE,
            reasonSummary: `Transfers via Metro-Auto interchange instead of standard rail interchange to avoid station congestion.`,
            avoidedImpacts: ['transfer_point_delay']
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 5: SCHEDULE SHIFT (EARLIER DEPARTURE ON TIMETABLE)
    // ------------------------------------------------------------------------
    // If original journey has a delay that causes deadline miss or excessive travel time
    const additionalDelay = originalImpact.totalAdditionalDelayMinutes || 0;
    if (additionalDelay > 0 || hasDelay) {
      // Calculate shift buffer (10 to 20 minutes earlier)
      const shiftMinutes = Math.min(30, Math.max(10, Math.ceil(additionalDelay / 5) * 5));
      const [h, m] = originalDeparture.split(':').map(Number);
      const totalOrigMins = h * 60 + m;
      const earlierTotalMins = Math.max(0, totalOrigMins - shiftMinutes);
      const earlierH = String(Math.floor(earlierTotalMins / 60)).padStart(2, '0');
      const earlierM = String(earlierTotalMins % 60).padStart(2, '0');
      const earlierDeparture = `${earlierH}:${earlierM}`;

      // Re-generate candidates departing at earlier scheduled time
      let earlierCandidates = [];
      if (originalJourney.primaryMode === 'train') {
        earlierCandidates = this.candidateEngine._buildTrainCandidates({
          origin,
          destination,
          departureTime: earlierDeparture,
          date,
          dayOfWeek,
          network: this.networkService.getNetwork()
        });
      } else if (originalJourney.primaryMode === 'bus') {
        earlierCandidates = this.candidateEngine._buildDirectBusCandidates({
          origin,
          destination,
          departureTime: earlierDeparture,
          date,
          dayOfWeek,
          network: this.networkService.getNetwork()
        });
      } else if (originalJourney.primaryMode === 'metro') {
        earlierCandidates = this.candidateEngine._buildMetroBusCandidates({
          origin,
          destination,
          departureTime: earlierDeparture,
          date,
          dayOfWeek,
          network: this.networkService.getNetwork()
        });
      }

      for (const cand of earlierCandidates) {
        if (this._isSubstantivelyDifferent(originalJourney, cand)) {
          rawAlternates.push({
            journey: cand,
            strategyType: ALTERNATE_STRATEGY_TYPES.SCHEDULE_SHIFT,
            reasonSummary: `Departs ${shiftMinutes} minutes earlier (${earlierDeparture}) using scheduled timetable service to absorb ${additionalDelay} min disruption delay and ensure on-time arrival.`,
            avoidedImpacts: ['arrival_deadline_miss']
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 6: REASONABLE WALKING ADJUSTMENT
    // ------------------------------------------------------------------------
    const distKm = this.candidateEngine._estimateDistanceKm(origin, destination);
    if (distKm <= 2.5) {
      const walkCand = this.candidateEngine._buildDirectWalkCandidate({
        origin,
        destination,
        departureTime: originalDeparture
      });
      if (walkCand && this._isSubstantivelyDifferent(originalJourney, walkCand)) {
        rawAlternates.push({
          journey: walkCand,
          strategyType: ALTERNATE_STRATEGY_TYPES.WALK_ADJUSTMENT,
          reasonSummary: `Adjusts to direct pedestrian walking route (${distKm} km), providing a reliable zero-fare alternative immune to vehicular disruptions.`,
          avoidedImpacts: ['vehicular_disruption', 'road_congestion']
        });
      }
    }

    // ------------------------------------------------------------------------
    // STRATEGY 7: DIRECT AUTO / ON-DEMAND FALLBACK
    // ------------------------------------------------------------------------
    if (originalJourney.primaryMode !== 'auto' && !isRoadAffected) {
      const autoCand = this.candidateEngine._buildDirectAutoCandidate({
        origin,
        destination,
        departureTime: originalDeparture
      });
      if (autoCand && this._isSubstantivelyDifferent(originalJourney, autoCand)) {
        rawAlternates.push({
          journey: autoCand,
          strategyType: ALTERNATE_STRATEGY_TYPES.MODE_SHIFT,
          reasonSummary: `Switches to on-demand direct auto-rickshaw to bypass mass transit service interruptions.`,
          avoidedImpacts: ['transit_disruption']
        });
      }
    }

    // ------------------------------------------------------------------------
    // 2. DEDUPLICATE ALTERNATES DETERMINISTICALLY
    // ------------------------------------------------------------------------
    const uniqueAlternates = this._deduplicateAlternates(rawAlternates, originalJourney);

    // ------------------------------------------------------------------------
    // 3. EVALUATE EACH ALTERNATE WITH CONTEXT ENGINE & ENRICH METADATA
    // ------------------------------------------------------------------------
    const evaluatedAlternates = uniqueAlternates.map((item, idx) => {
      const altJourney = item.journey;
      const altImpact = this.contextEngine.evaluateJourney(altJourney, context, options);

      const isFeasible = altImpact.isFeasible && (altJourney.isViable !== false);
      const differences = this._computeDifferences(originalJourney, altJourney);

      const alternateMetadata = {
        alternateIndex: idx + 1,
        originalJourneyId: originalJourney.id,
        strategyType: item.strategyType,
        differenceReason: item.reasonSummary,
        avoidedImpacts: item.avoidedImpacts,
        isFeasible,
        feasibilityReason: altImpact.feasibilityReason,
        originalDurationMinutes: originalJourney.totalDurationMinutes,
        updatedDurationMinutes: altImpact.updatedDurationMinutes,
        additionalDisruptionDelayMinutes: altImpact.disruptionImpact?.totalDelayMinutes || 0,
        totalAdditionalDelayMinutes: altImpact.totalAdditionalDelayMinutes || 0,
        affectedSegmentsCount: altImpact.affectedSegments.length,
        unavailableSegmentsCount: altImpact.unavailableSegments.length,
        differences
      };

      // Attach alternateMetadata to journey instance
      altJourney.alternateMetadata = alternateMetadata;
      if (!altJourney.advisories.includes(`ALTERNATE_ROUTE: ${item.reasonSummary}`)) {
        altJourney.advisories.push(`ALTERNATE_ROUTE: ${item.reasonSummary}`);
      }

      return {
        journey: altJourney,
        alternateMetadata,
        contextualImpact: altImpact,
        isFeasible,
        provenance: altJourney.provenance
      };
    });

    // Apply maxAlternates limit (default: 4)
    const limit = Math.max(1, options.maxAlternates || 5);
    return evaluatedAlternates.slice(0, limit);
  }

  /**
   * Evaluates an array of candidates and produces non-duplicate alternates for any affected journeys.
   *
   * @param {Array<CommuteJourney>} candidateJourneys
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {Promise<{ originalJourneys: Array, alternates: Array }>}
   */
  async generateAlternatesForCandidates(candidateJourneys = [], context = {}, options = {}) {
    if (!Array.isArray(candidateJourneys) || candidateJourneys.length === 0) {
      return { originalJourneys: [], alternates: [] };
    }

    const allAlternates = [];
    const seenSignatures = new Set(candidateJourneys.map(j => this._getJourneySignature(j)));

    for (const journey of candidateJourneys) {
      const alternates = await this.generateAlternatesForJourney(journey, context, options);
      for (const alt of alternates) {
        const sig = this._getJourneySignature(alt.journey);
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          allAlternates.push(alt);
        }
      }
    }

    return {
      originalJourneys: candidateJourneys,
      alternates: allAlternates
    };
  }

  // ==========================================================================
  // HELPERS: COMPARISON, DEDUPLICATION, DIFFERENCES
  // ==========================================================================

  /**
   * Determines if a candidate alternate is substantively different from the original journey.
   * @private
   */
  _isSubstantivelyDifferent(original, candidate) {
    if (!original || !candidate) return false;

    // Different primary mode
    if (original.primaryMode !== candidate.primaryMode) return true;

    // Different mode sequence
    const origModes = original.modesIncluded.join('-');
    const candModes = candidate.modesIncluded.join('-');
    if (origModes !== candModes) return true;

    // Different departure time (by > 3 minutes)
    if (original.departureTime && candidate.departureTime) {
      const origMins = this.scheduleService.timeToMinutes(original.departureTime);
      const candMins = this.scheduleService.timeToMinutes(candidate.departureTime);
      if (Math.abs(origMins - candMins) > 3) return true;
    }

    // Different transfer count
    if (original.transferCount !== candidate.transferCount) return true;

    // Different line identifiers
    const origLines = original.segments.map(s => s.lineIdentifier || s.mode).filter(Boolean).sort().join('|');
    const candLines = candidate.segments.map(s => s.lineIdentifier || s.mode).filter(Boolean).sort().join('|');
    if (origLines !== candLines) return true;

    return false;
  }

  /**
   * Generates a deterministic signature for deduplication.
   * @private
   */
  _getJourneySignature(journey) {
    const lines = journey.segments.map(s => s.lineIdentifier || s.mode).join('-');
    return [
      journey.primaryMode,
      journey.modesIncluded.slice().sort().join('-'),
      journey.departureTime,
      journey.estimatedArrivalTime,
      journey.totalDurationMinutes,
      journey.transferCount,
      lines
    ].join('|');
  }

  /**
   * Deduplicates alternates and prevents identical routes to the original journey.
   * @private
   */
  _deduplicateAlternates(alternates, originalJourney) {
    const origSignature = this._getJourneySignature(originalJourney);
    const seen = new Set([origSignature]);
    const unique = [];

    for (const alt of alternates) {
      const sig = this._getJourneySignature(alt.journey);
      if (!seen.has(sig)) {
        seen.add(sig);
        unique.push(alt);
      }
    }

    return unique;
  }

  /**
   * Computes itemized differences between original and alternate journeys.
   * @private
   */
  _computeDifferences(original, alternate) {
    const diffs = [];

    if (original.primaryMode !== alternate.primaryMode) {
      diffs.push({
        field: 'primaryMode',
        original: original.primaryMode,
        alternate: alternate.primaryMode,
        description: `Primary mode changed from ${original.primaryMode} to ${alternate.primaryMode}`
      });
    }

    if (original.departureTime !== alternate.departureTime) {
      diffs.push({
        field: 'departureTime',
        original: original.departureTime,
        alternate: alternate.departureTime,
        description: `Departure time shifted from ${original.departureTime} to ${alternate.departureTime}`
      });
    }

    if (original.transferCount !== alternate.transferCount) {
      diffs.push({
        field: 'transferCount',
        original: original.transferCount,
        alternate: alternate.transferCount,
        description: `Transfers changed from ${original.transferCount} to ${alternate.transferCount}`
      });
    }

    if (original.estimatedCostRupees !== alternate.estimatedCostRupees) {
      diffs.push({
        field: 'estimatedCostRupees',
        original: original.estimatedCostRupees,
        alternate: alternate.estimatedCostRupees,
        description: `Fare changed from Rs ${original.estimatedCostRupees} to Rs ${alternate.estimatedCostRupees}`
      });
    }

    const origLines = original.segments.map(s => s.lineIdentifier).filter(Boolean);
    const altLines = alternate.segments.map(s => s.lineIdentifier).filter(Boolean);
    if (origLines.join(',') !== altLines.join(',')) {
      diffs.push({
        field: 'linesUsed',
        original: origLines,
        alternate: altLines,
        description: `Transit corridors changed from [${origLines.join(', ')}] to [${altLines.join(', ')}]`
      });
    }

    return diffs;
  }
}

const alternateRouteService = new AlternateRouteService();

module.exports = {
  AlternateRouteService,
  alternateRouteService,
  ALTERNATE_STRATEGY_TYPES
};
