/**
 * RouteComparisonService
 *
 * Dedicated, deterministic route comparison service for candidate commute journeys (P9).
 *
 * Responsibilities:
 * - Compares multiple feasible commute journeys in a structured, explainable, and multi-dimensional way.
 * - For EVERY route exposes comparable information:
 *   - estimated arrival time (estimatedArrivalTime)
 *   - total duration (totalDuration)
 *   - disruption delay (disruptionDelay)
 *   - waiting time (waitingTime)
 *   - walking time (walkingTime)
 *   - transfers (transfers)
 *   - estimated cost (estimatedCost)
 *   - reliability / uncertainty (reliability, uncertainty)
 *   - affected segments (affectedSegments)
 *   - transport modes (transportModes)
 *   - provenance (provenance)
 *   - deterministic score (deterministicScore)
 *   - strengths (strengths)
 *   - weaknesses (weaknesses)
 *
 * Design Invariants:
 * - NEVER claims that one route is universally best simply because of one metric.
 * - Handles ties and near-identical routes deterministically with explicit tie-breaker reasons.
 * - Identifies duplicates and near-duplicate routes without losing candidate information.
 * - Structured for direct consumption by downstream recommendation engine and frontend UI.
 */

const { RouteEvaluation } = require('../models/RouteEvaluation');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');
const { routeEvaluationService } = require('./routeEvaluationService');
const { deterministicRouteScoringService } = require('./deterministicRouteScoringService');
const { ValidationError } = require('../errors');

/**
 * Standard thresholds used for identifying strengths and weaknesses across Mumbai student transit.
 */
const DEFAULT_THRESHOLDS = Object.freeze({
  FAST_DURATION_MINUTES: 35,
  SLOW_DURATION_MINUTES: 55,
  LOW_COST_RUPEES: 15,
  HIGH_COST_RUPEES: 50,
  MINIMAL_WALKING_MINUTES: 8,
  HIGH_WALKING_MINUTES: 15,
  HIGH_WAITING_MINUTES: 10,
  EXCESSIVE_TRANSFERS: 2,
  MAX_NEAR_DUPLICATE_VARIANCE_MINUTES: 2
});

class RouteComparisonService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.routeEvaluationService]
   * @param {object} [options.routeScoringService]
   * @param {object} [options.thresholds]
   */
  constructor(options = {}) {
    this.routeEvaluationService = options.routeEvaluationService || routeEvaluationService;
    this.routeScoringService = options.routeScoringService || deterministicRouteScoringService;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  }

  /**
   * Compares multiple commute routes in a structured, multi-dimensional, and explainable way.
   *
   * @param {Array<RouteEvaluation|object>} routes - Candidate journeys, RouteEvaluations, or scored routes
   * @param {object|Array<object>} [contextOrImpacts={}] - Commute context or matching UnifiedJourneyImpacts
   * @param {object} [options={}] - Options (thresholds, filterDuplicates)
   * @returns {object} Comprehensive route comparison structure
   */
  compareRoutes(routes, contextOrImpacts = {}, options = {}) {
    if (!Array.isArray(routes)) {
      throw new ValidationError('Routes must be provided as an array for comparison');
    }

    if (routes.length === 0) {
      return {
        routes: [],
        comparisonSummary: {
          totalRoutesCompared: 0,
          feasibleCount: 0,
          infeasibleCount: 0,
          hasDisruptedRoutes: false,
          hasDuplicates: false,
          hasNearDuplicates: false,
          hasTies: false,
          metricLeaders: {},
          tradeOffNotes: [],
          universalBestClaim: false,
          disclaimer: 'No routes provided for comparison.'
        },
        metricRanges: {},
        provenanceSummary: {
          dataTiers: [],
          allVerified: false,
          confidenceBreakdown: {},
          hasUnverifiedData: false
        }
      };
    }

    const thresholds = { ...this.thresholds, ...options.thresholds };

    // -------------------------------------------------------------------------
    // 1. INGESTION, EVALUATION & SCORING OF ALL CANDIDATES
    // -------------------------------------------------------------------------
    const normalizedList = routes.map((item, idx) => {
      const matchingContext = Array.isArray(contextOrImpacts)
        ? contextOrImpacts[idx] || {}
        : contextOrImpacts;

      let routeEval;
      if (item instanceof RouteEvaluation) {
        routeEval = item;
      } else if (item.evaluatedMetrics && item.journey) {
        // Candidate passed from routeConstraintFilteringService
        routeEval = this.routeEvaluationService.evaluateRoute(item.journey, matchingContext, options);
      } else if (item.journeyId && item.totalTravelTime !== undefined && item.primaryMode) {
        // Plain object conforming to RouteEvaluation shape
        routeEval = new RouteEvaluation(item);
      } else {
        // Raw CommuteJourney or candidate route
        routeEval = this.routeEvaluationService.evaluateRoute(item, matchingContext, options);
      }

      // Compute deterministic score & breakdown
      const scored = this.routeScoringService.scoreRoute(routeEval, matchingContext, options);

      return {
        inputIndex: idx,
        raw: item,
        eval: routeEval,
        scored
      };
    });

    // -------------------------------------------------------------------------
    // 2. DETERMINISTIC SORTING & TIE DETECTION
    // -------------------------------------------------------------------------
    normalizedList.sort((a, b) => this._compareCandidateRanks(a, b));

    // Assign rank and detect ties
    const tiedGroups = this._detectTies(normalizedList);

    // -------------------------------------------------------------------------
    // 3. DUPLICATE & NEAR-DUPLICATE DETECTION
    // -------------------------------------------------------------------------
    const { duplicateFlags, duplicateGroups } = this._detectDuplicates(normalizedList, thresholds);

    // -------------------------------------------------------------------------
    // 4. METRIC EXTREMES & LEADERS COMPUTATION
    // -------------------------------------------------------------------------
    const poolMetrics = this._extractPoolMetrics(normalizedList);

    // -------------------------------------------------------------------------
    // 5. EXTRACT COMPARABLE ATTRIBUTES, STRENGTHS & WEAKNESSES PER ROUTE
    // -------------------------------------------------------------------------
    const comparedRoutes = normalizedList.map((entry, idx) => {
      const { eval: routeEval, scored } = entry;
      const jId = routeEval.journeyId;
      const tieInfo = tiedGroups.get(jId) || { isTied: false, tieBreakerReason: null };
      const dupInfo = duplicateFlags.get(jId) || { isDuplicate: false, duplicateOf: null, isNearDuplicate: false, nearDuplicateOf: null };

      // Required attributes
      const estimatedArrivalTime = routeEval.updatedArrivalTime || routeEval.estimatedArrivalTime;
      const totalDuration = Number(routeEval.totalTravelTime);
      const disruptionDelay = Number(routeEval.additionalDisruptionDelay || 0);
      const waitingTime = Number(routeEval.waitingTime || 0);
      const walkingTime = Number(routeEval.walkingTime || 0);
      const transfers = Number(routeEval.numberOfTransfers || 0);
      const estimatedCost = Number(routeEval.estimatedCost || 0);
      const reliability = routeEval.reliability || 'LOW';
      const uncertainty = routeEval.uncertainty || reliability;
      const affectedSegments = Array.isArray(routeEval.affectedSegments) ? routeEval.affectedSegments : [];
      const transportModes = Array.isArray(routeEval.modesIncluded) && routeEval.modesIncluded.length > 0
        ? [...routeEval.modesIncluded]
        : [routeEval.primaryMode];
      const rawProvenance = routeEval.provenance instanceof DataProvenance
        ? routeEval.provenance.toJSON()
        : (typeof routeEval.provenance?.toJSON === 'function' ? routeEval.provenance.toJSON() : routeEval.provenance);
      const provenance = rawProvenance ? {
        ...rawProvenance,
        tier: rawProvenance.sourceTier || rawProvenance.tier || 'ESTIMATED',
        sourceTier: rawProvenance.sourceTier || rawProvenance.tier || 'ESTIMATED'
      } : { tier: 'ESTIMATED', sourceTier: 'ESTIMATED' };
      const deterministicScore = Number(scored.compositeScore);

      // Derive strengths & weaknesses
      const strengths = this._deriveStrengths(entry, poolMetrics, thresholds);
      const weaknesses = this._deriveWeaknesses(entry, poolMetrics, thresholds);

      return {
        journeyId: jId,
        origin: routeEval.origin,
        destination: routeEval.destination,
        departureTime: routeEval.departureTime,
        estimatedArrivalTime,
        totalDuration,
        disruptionDelay,
        waitingTime,
        walkingTime,
        transfers,
        estimatedCost,
        reliability,
        uncertainty,
        affectedSegments,
        transportModes,
        primaryMode: routeEval.primaryMode,
        provenance,
        deterministicScore,
        strengths,
        weaknesses,
        // Status & rank details
        isFeasible: routeEval.isFeasible,
        feasibilityReason: routeEval.feasibilityReason,
        rank: idx + 1,
        isTied: tieInfo.isTied,
        tieBreakerReason: tieInfo.tieBreakerReason,
        isDuplicate: dupInfo.isDuplicate,
        duplicateOf: dupInfo.duplicateOf,
        isNearDuplicate: dupInfo.isNearDuplicate,
        nearDuplicateOf: dupInfo.nearDuplicateOf,
        routeSignature: entry.signature
      };
    });

    // Filter duplicates if requested
    const finalRoutes = options.filterDuplicates
      ? comparedRoutes.filter(r => !r.isDuplicate)
      : comparedRoutes;

    // -------------------------------------------------------------------------
    // 6. BUILD MULTI-DIMENSIONAL COMPARISON SUMMARY & TRADE-OFFS
    // -------------------------------------------------------------------------
    const comparisonSummary = this._buildComparisonSummary(comparedRoutes, poolMetrics, duplicateGroups);
    const metricRanges = this._buildMetricRanges(comparedRoutes);
    const provenanceSummary = this._buildProvenanceSummary(comparedRoutes);

    return {
      routes: finalRoutes,
      comparisonSummary,
      metricRanges,
      provenanceSummary,
      duplicateGroups
    };
  }

  /**
   * Dedicated pairwise head-to-head route comparison.
   *
   * @param {RouteEvaluation|object} routeA
   * @param {RouteEvaluation|object} routeB
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {object} Pairwise comparison and trade-off analysis
   */
  comparePair(routeA, routeB, context = {}, options = {}) {
    if (!routeA || !routeB) {
      throw new ValidationError('Both routeA and routeB are required for pairwise comparison');
    }

    const comparison = this.compareRoutes([routeA, routeB], [context, context], options);
    const idA = routeA.journeyId || routeA.id;
    const idB = routeB.journeyId || routeB.id;
    const compA = comparison.routes.find(r => r.journeyId === idA) || comparison.routes[0];
    const compB = comparison.routes.find(r => r.journeyId === idB) || comparison.routes[1];

    const durationDiff = compB.totalDuration - compA.totalDuration;
    const costDiff = compB.estimatedCost - compA.estimatedCost;
    const walkingDiff = compB.walkingTime - compA.walkingTime;
    const transfersDiff = compB.transfers - compA.transfers;
    const scoreDiff = compA.deterministicScore - compB.deterministicScore;

    const tradeOffs = [];
    if (durationDiff !== 0) {
      const faster = durationDiff > 0 ? compA : compB;
      const slower = durationDiff > 0 ? compB : compA;
      tradeOffs.push(`'${faster.journeyId}' is faster by ${Math.abs(durationDiff)} mins (${faster.totalDuration}m vs ${slower.totalDuration}m)`);
    }

    if (costDiff !== 0) {
      const cheaper = costDiff > 0 ? compA : compB;
      const pricier = costDiff > 0 ? compB : compA;
      tradeOffs.push(`'${cheaper.journeyId}' is ₹${Math.abs(costDiff)} cheaper (₹${cheaper.estimatedCost} vs ₹${pricier.estimatedCost})`);
    }

    if (walkingDiff !== 0) {
      const lessWalk = walkingDiff > 0 ? compA : compB;
      const moreWalk = walkingDiff > 0 ? compB : compA;
      tradeOffs.push(`'${lessWalk.journeyId}' saves ${Math.abs(walkingDiff)} mins walking (${lessWalk.walkingTime}m vs ${moreWalk.walkingTime}m)`);
    }

    if (transfersDiff !== 0) {
      const fewerTrans = transfersDiff > 0 ? compA : compB;
      const moreTrans = transfersDiff > 0 ? compB : compA;
      tradeOffs.push(`'${fewerTrans.journeyId}' requires ${Math.abs(transfersDiff)} fewer transfer(s) (${fewerTrans.transfers} vs ${moreTrans.transfers})`);
    }

    return {
      routeA: compA,
      routeB: compB,
      deltas: {
        durationDifferenceMinutes: durationDiff,
        costDifferenceRupees: costDiff,
        walkingDifferenceMinutes: walkingDiff,
        transfersDifference: transfersDiff,
        scoreDifferencePoints: scoreDiff
      },
      winnerByMetric: {
        speed: compA.totalDuration <= compB.totalDuration ? compA.journeyId : compB.journeyId,
        cost: compA.estimatedCost <= compB.estimatedCost ? compA.journeyId : compB.journeyId,
        walking: compA.walkingTime <= compB.walkingTime ? compA.journeyId : compB.journeyId,
        transfers: compA.transfers <= compB.transfers ? compA.journeyId : compB.journeyId,
        score: compA.deterministicScore >= compB.deterministicScore ? compA.journeyId : compB.journeyId
      },
      tradeOffSummary: tradeOffs,
      universalBestClaim: false,
      disclaimer: 'Selection depends on trade-off preferences: no single route is universally superior across all dimensions.'
    };
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * Deterministic comparator ordering candidate routes.
   *
   * @private
   */
  _compareCandidateRanks(a, b) {
    const evalA = a.eval;
    const evalB = b.eval;
    const scoreA = a.scored.compositeScore;
    const scoreB = b.scored.compositeScore;

    // Rule 1: Feasible routes ALWAYS outrank infeasible routes
    if (evalA.isFeasible !== evalB.isFeasible) {
      return evalA.isFeasible ? -1 : 1;
    }

    // Rule 2: Higher deterministic composite score first
    if (Math.abs(scoreB - scoreA) > 0.001) {
      return scoreB - scoreA;
    }

    // Rule 3: Lower total travel time first
    if (evalA.totalTravelTime !== evalB.totalTravelTime) {
      return evalA.totalTravelTime - evalB.totalTravelTime;
    }

    // Rule 4: Fewer transfers first
    if (evalA.numberOfTransfers !== evalB.numberOfTransfers) {
      return evalA.numberOfTransfers - evalB.numberOfTransfers;
    }

    // Rule 5: Lower monetary cost first
    if (evalA.estimatedCost !== evalB.estimatedCost) {
      return evalA.estimatedCost - evalB.estimatedCost;
    }

    // Rule 6: Lower walking time first
    if (evalA.walkingTime !== evalB.walkingTime) {
      return evalA.walkingTime - evalB.walkingTime;
    }

    // Rule 7: Lower disruption delay first
    const delayA = Number(evalA.additionalDisruptionDelay || 0);
    const delayB = Number(evalB.additionalDisruptionDelay || 0);
    if (delayA !== delayB) {
      return delayA - delayB;
    }

    // Rule 8: Alphabetical journey ID for stable deterministic ordering (matches DeterministicRouteScoringService)
    if (evalA.journeyId !== evalB.journeyId) {
      return String(evalA.journeyId).localeCompare(String(evalB.journeyId));
    }

    // Rule 9: Stable original input order
    if (a.inputIndex !== undefined && b.inputIndex !== undefined) {
      return a.inputIndex - b.inputIndex;
    }

    return 0;
  }

  /**
   * Detects tied scores and records the deterministic reason that ordered them.
   *
   * @private
   */
  _detectTies(sortedList) {
    const tiedMap = new Map();

    for (let i = 0; i < sortedList.length; i++) {
      const current = sortedList[i];
      const prev = i > 0 ? sortedList[i - 1] : null;
      const next = i < sortedList.length - 1 ? sortedList[i + 1] : null;

      const isTiedWithPrev = prev && Math.abs(current.scored.compositeScore - prev.scored.compositeScore) <= 0.001;
      const isTiedWithNext = next && Math.abs(current.scored.compositeScore - next.scored.compositeScore) <= 0.001;

      if (isTiedWithPrev || isTiedWithNext) {
        const partner = isTiedWithPrev ? prev : next;
        let reason = 'IDENTICAL_METRICS';

        if (current.eval.totalTravelTime !== partner.eval.totalTravelTime) {
          reason = 'TIED_SCORE_BROKEN_BY_TOTAL_DURATION';
        } else if (current.eval.numberOfTransfers !== partner.eval.numberOfTransfers) {
          reason = 'TIED_SCORE_BROKEN_BY_TRANSFERS';
        } else if (current.eval.estimatedCost !== partner.eval.estimatedCost) {
          reason = 'TIED_SCORE_BROKEN_BY_COST';
        } else if (current.eval.walkingTime !== partner.eval.walkingTime) {
          reason = 'TIED_SCORE_BROKEN_BY_WALKING_TIME';
        } else if ((current.eval.additionalDisruptionDelay || 0) !== (partner.eval.additionalDisruptionDelay || 0)) {
          reason = 'TIED_SCORE_BROKEN_BY_DISRUPTION_DELAY';
        } else if (current.eval.journeyId !== partner.eval.journeyId) {
          reason = 'TIED_SCORE_BROKEN_BY_JOURNEY_ID';
        }

        tiedMap.set(current.eval.journeyId, {
          isTied: true,
          tieBreakerReason: reason
        });
      } else {
        tiedMap.set(current.eval.journeyId, {
          isTied: false,
          tieBreakerReason: null
        });
      }
    }

    return tiedMap;
  }

  /**
   * Detects exact duplicate and near-duplicate journeys.
   *
   * @private
   */
  _detectDuplicates(list, thresholds) {
    const duplicateFlags = new Map();
    const duplicateGroups = [];
    const seenSignatures = new Map(); // exact signature -> primary journeyId
    const seenRoutes = []; // for near-duplicate scanning

    // Process in input order so that the earlier-provided candidate is considered primary
    const inputOrderList = [...list].sort((a, b) => (a.inputIndex || 0) - (b.inputIndex || 0));

    for (const item of inputOrderList) {
      const e = item.eval;
      const jId = e.journeyId;
      const modes = (Array.isArray(e.modesIncluded) ? [...e.modesIncluded] : [e.primaryMode]).sort().join('-');
      const segSummary = (Array.isArray(e.raw?.segments) ? e.raw.segments : [])
        .map(s => `${s.mode}:${s.lineIdentifier || ''}`)
        .join('|');

      const exactSig = `${modes}:${e.departureTime}:${e.updatedArrivalTime || e.estimatedArrivalTime}:${e.totalTravelTime}:${e.numberOfTransfers}:${e.estimatedCost}:${segSummary}`;
      item.signature = exactSig;

      if (seenSignatures.has(exactSig)) {
        const primaryId = seenSignatures.get(exactSig);
        duplicateFlags.set(jId, {
          isDuplicate: true,
          duplicateOf: primaryId,
          isNearDuplicate: false,
          nearDuplicateOf: null
        });

        // Add to duplicate groups
        let group = duplicateGroups.find(g => g.primaryJourneyId === primaryId && g.type === 'EXACT');
        if (!group) {
          group = { primaryJourneyId: primaryId, duplicateJourneyIds: [], type: 'EXACT' };
          duplicateGroups.push(group);
        }
        group.duplicateJourneyIds.push(jId);
      } else {
        seenSignatures.set(exactSig, jId);

        // Check for near-duplicates
        let nearDupOf = null;
        for (const prev of seenRoutes) {
          const sameModes = prev.modes === modes;
          const sameTransfers = prev.transfers === e.numberOfTransfers;
          const sameCost = prev.cost === e.estimatedCost;
          const durationDiff = Math.abs(prev.duration - e.totalTravelTime);

          if (sameModes && sameTransfers && sameCost && durationDiff <= thresholds.MAX_NEAR_DUPLICATE_VARIANCE_MINUTES && durationDiff > 0) {
            nearDupOf = prev.journeyId;
            break;
          }
        }

        if (nearDupOf) {
          duplicateFlags.set(jId, {
            isDuplicate: false,
            duplicateOf: null,
            isNearDuplicate: true,
            nearDuplicateOf: nearDupOf
          });

          let group = duplicateGroups.find(g => g.primaryJourneyId === nearDupOf && g.type === 'NEAR_DUPLICATE');
          if (!group) {
            group = { primaryJourneyId: nearDupOf, duplicateJourneyIds: [], type: 'NEAR_DUPLICATE' };
            duplicateGroups.push(group);
          }
          group.duplicateJourneyIds.push(jId);
        } else {
          duplicateFlags.set(jId, {
            isDuplicate: false,
            duplicateOf: null,
            isNearDuplicate: false,
            nearDuplicateOf: null
          });
        }

        seenRoutes.push({
          journeyId: jId,
          modes,
          transfers: e.numberOfTransfers,
          cost: e.estimatedCost,
          duration: e.totalTravelTime
        });
      }
    }

    return { duplicateFlags, duplicateGroups };
  }

  /**
   * Extracts pool-wide metric extremes (min, max) for relative comparisons.
   *
   * @private
   */
  _extractPoolMetrics(list) {
    const durations = [];
    const costs = [];
    const walkTimes = [];
    const transfersList = [];
    const arrivalTimes = [];
    const scores = [];

    list.forEach(entry => {
      const e = entry.eval;
      if (e.isFeasible) {
        durations.push(Number(e.totalTravelTime));
        costs.push(Number(e.estimatedCost));
        walkTimes.push(Number(e.walkingTime));
        transfersList.push(Number(e.numberOfTransfers));
        arrivalTimes.push(e.updatedArrivalTime || e.estimatedArrivalTime);
        scores.push(Number(entry.scored.compositeScore));
      }
    });

    return {
      minDuration: durations.length ? Math.min(...durations) : 0,
      maxDuration: durations.length ? Math.max(...durations) : 0,
      minCost: costs.length ? Math.min(...costs) : 0,
      maxCost: costs.length ? Math.max(...costs) : 0,
      minWalk: walkTimes.length ? Math.min(...walkTimes) : 0,
      maxWalk: walkTimes.length ? Math.max(...walkTimes) : 0,
      minTransfers: transfersList.length ? Math.min(...transfersList) : 0,
      maxTransfers: transfersList.length ? Math.max(...transfersList) : 0,
      maxScore: scores.length ? Math.max(...scores) : 0,
      earliestArrival: arrivalTimes.length ? [...arrivalTimes].sort()[0] : '08:00',
      totalCandidates: list.length
    };
  }

  /**
   * Derives objective, grounded strengths for a given route.
   *
   * @private
   */
  _deriveStrengths(entry, pool, thresholds) {
    const e = entry.eval;
    const strengths = [];

    const duration = Number(e.totalTravelTime);
    const cost = Number(e.estimatedCost);
    const walking = Number(e.walkingTime);
    const transfers = Number(e.numberOfTransfers);
    const disruption = Number(e.additionalDisruptionDelay || 0);
    const arrival = e.updatedArrivalTime || e.estimatedArrivalTime;

    // 1. Travel time strength
    if (pool.totalCandidates > 1 && duration === pool.minDuration) {
      strengths.push(`Fastest travel time among compared routes (${duration} mins)`);
    } else if (duration <= thresholds.FAST_DURATION_MINUTES) {
      strengths.push(`Quick travel time (${duration} mins)`);
    }

    // 2. Cost strength
    if (cost === 0) {
      strengths.push('Zero fare commute (non-motorized)');
    } else if (pool.totalCandidates > 1 && cost === pool.minCost) {
      strengths.push(`Most economical option (₹${cost})`);
    } else if (cost <= thresholds.LOW_COST_RUPEES) {
      strengths.push(`Low student transit fare (₹${cost})`);
    }

    // 3. Transfers strength
    if (transfers === 0) {
      strengths.push('Direct connection with 0 transfers');
    } else if (pool.totalCandidates > 1 && transfers === pool.minTransfers && transfers < 2) {
      strengths.push(`Fewest interchanges (${transfers} transfer)`);
    }

    // 4. Walking exertion strength
    if (walking <= thresholds.MINIMAL_WALKING_MINUTES) {
      strengths.push(`Minimal walking required (${walking} mins)`);
    } else if (pool.totalCandidates > 1 && walking === pool.minWalk && walking < thresholds.HIGH_WALKING_MINUTES) {
      strengths.push(`Least pedestrian exertion (${walking} mins walking)`);
    }

    // 5. Disruption & reliability strength
    if (disruption === 0 && (!e.affectedSegments || e.affectedSegments.length === 0)) {
      strengths.push('Zero disruption delay across all corridors');
    }
    if (e.reliability === 'LOW') {
      strengths.push('High schedule reliability with minimal volatility');
    }

    // 6. Arrival strength
    if (pool.totalCandidates > 1 && arrival === pool.earliestArrival && pool.earliestArrival !== '08:00') {
      strengths.push(`Earliest arrival time at campus (${arrival})`);
    }

    // 7. Provenance strength
    const tier = e.provenance?.sourceTier || e.provenance?.tier;
    if (tier === PROVENANCE_TIERS.VERIFIED) {
      strengths.push('Grounded in verified official transit timetable feed');
    }

    return strengths;
  }

  /**
   * Derives objective, grounded weaknesses for a given route.
   *
   * @private
   */
  _deriveWeaknesses(entry, pool, thresholds) {
    const e = entry.eval;
    const weaknesses = [];

    const duration = Number(e.totalTravelTime);
    const cost = Number(e.estimatedCost);
    const walking = Number(e.walkingTime);
    const waiting = Number(e.waitingTime || 0);
    const transfers = Number(e.numberOfTransfers);
    const disruption = Number(e.additionalDisruptionDelay || 0);
    const trafficDelay = Number(e.trafficImpact?.addedTravelTimeMinutes || 0);

    // 1. Feasibility check
    if (!e.isFeasible) {
      weaknesses.push(`Route currently infeasible / suspended (${e.feasibilityReason})`);
      return weaknesses;
    }

    // 2. Disruption weakness
    if (disruption > 0) {
      weaknesses.push(`+${disruption} mins unexpected delay from active service disruption`);
    }

    // 3. Traffic delay weakness
    if (trafficDelay > 0) {
      weaknesses.push(`+${trafficDelay} mins congestion delay on road segments`);
    }

    // 4. Affected segments
    if (Array.isArray(e.affectedSegments) && e.affectedSegments.length > 0) {
      weaknesses.push(`${e.affectedSegments.length} transit segment(s) impacted by active alerts`);
    }

    // 5. Walking burden
    if (walking > thresholds.HIGH_WALKING_MINUTES) {
      weaknesses.push(`High walking burden (${walking} mins pedestrian exertion)`);
    }

    // 6. Excessive transfers
    if (transfers >= thresholds.EXCESSIVE_TRANSFERS) {
      weaknesses.push(`Multiple interchanges (${transfers} transfers) increase connection risk`);
    }

    // 7. Extended waiting
    if (waiting > thresholds.HIGH_WAITING_MINUTES) {
      weaknesses.push(`Extended waiting time at boarding stops (${waiting} mins)`);
    }

    // 8. Cost friction
    if (cost > thresholds.HIGH_COST_RUPEES) {
      weaknesses.push(`High monetary cost (₹${cost}) relative to student transit budget`);
    } else if (pool.totalCandidates > 1 && cost === pool.maxCost && cost - pool.minCost >= 25) {
      weaknesses.push(`Higher fare than alternatives (+₹${cost - pool.minCost})`);
    }

    // 9. Duration friction
    if (duration > thresholds.SLOW_DURATION_MINUTES) {
      weaknesses.push(`Long overall duration (${duration} mins total travel time)`);
    } else if (pool.totalCandidates > 1 && duration === pool.maxDuration && duration - pool.minDuration >= 15) {
      weaknesses.push(`Significantly slower than alternatives (+${duration - pool.minDuration} mins)`);
    }

    // 10. Uncertainty
    if (e.uncertainty === 'HIGH' || e.uncertainty === 'SEVERE') {
      weaknesses.push(`Elevated service volatility / crowd uncertainty (${e.uncertainty})`);
    }

    // 11. Weather impact
    if (e.weatherImpact?.condition && e.weatherImpact.condition !== 'clear' && e.weatherImpact.totalAddedTravelTimeMinutes > 0) {
      weaknesses.push(`Weather-related transit impedance (${e.weatherImpact.condition})`);
    }

    return weaknesses;
  }

  /**
   * Compiles multi-dimensional summary, metric leaders, and explainable trade-off notes.
   *
   * @private
   */
  _buildComparisonSummary(routes, pool, duplicateGroups) {
    const totalRoutesCompared = routes.length;
    const feasibleRoutes = routes.filter(r => r.isFeasible);
    const feasibleCount = feasibleRoutes.length;
    const infeasibleCount = totalRoutesCompared - feasibleCount;
    const hasDisruptedRoutes = routes.some(r => r.disruptionDelay > 0 || r.affectedSegments.length > 0);
    const hasDuplicates = routes.some(r => r.isDuplicate);
    const hasNearDuplicates = routes.some(r => r.isNearDuplicate);
    const hasTies = routes.some(r => r.isTied);

    // Identify metric leaders
    const metricLeaders = {};
    if (feasibleRoutes.length > 0) {
      metricLeaders.fastest = {
        journeyIds: feasibleRoutes.filter(r => r.totalDuration === pool.minDuration).map(r => r.journeyId),
        value: pool.minDuration,
        unit: 'minutes'
      };

      metricLeaders.cheapest = {
        journeyIds: feasibleRoutes.filter(r => r.estimatedCost === pool.minCost).map(r => r.journeyId),
        value: pool.minCost,
        unit: 'rupees'
      };

      metricLeaders.leastWalking = {
        journeyIds: feasibleRoutes.filter(r => r.walkingTime === pool.minWalk).map(r => r.journeyId),
        value: pool.minWalk,
        unit: 'minutes'
      };

      metricLeaders.fewestTransfers = {
        journeyIds: feasibleRoutes.filter(r => r.transfers === pool.minTransfers).map(r => r.journeyId),
        value: pool.minTransfers,
        unit: 'transfers'
      };

      metricLeaders.highestScore = {
        journeyIds: feasibleRoutes.filter(r => Math.abs(r.deterministicScore - pool.maxScore) <= 0.01).map(r => r.journeyId),
        value: pool.maxScore,
        unit: 'points'
      };

      metricLeaders.earliestArrival = {
        journeyIds: feasibleRoutes.filter(r => r.estimatedArrivalTime === pool.earliestArrival).map(r => r.journeyId),
        value: pool.earliestArrival,
        unit: 'HH:MM'
      };
    }

    // Compile human-readable trade-off notes between routes
    const tradeOffNotes = [];
    if (feasibleRoutes.length >= 2) {
      const topRoute = feasibleRoutes[0];
      for (let i = 1; i < Math.min(4, feasibleRoutes.length); i++) {
        const alt = feasibleRoutes[i];
        if (alt.isDuplicate) continue;

        const timeDiff = alt.totalDuration - topRoute.totalDuration;
        const costDiff = alt.estimatedCost - topRoute.estimatedCost;
        const walkDiff = alt.walkingTime - topRoute.walkingTime;

        if (costDiff < 0 && timeDiff > 0) {
          tradeOffNotes.push(`Route '${alt.journeyId}' saves ₹${Math.abs(costDiff)} compared to '${topRoute.journeyId}', but takes ${timeDiff} mins longer.`);
        } else if (costDiff > 0 && timeDiff < 0) {
          tradeOffNotes.push(`Route '${alt.journeyId}' is ${Math.abs(timeDiff)} mins faster than '${topRoute.journeyId}', but costs ₹${costDiff} more.`);
        } else if (walkDiff < 0 && timeDiff > 0) {
          tradeOffNotes.push(`Route '${alt.journeyId}' requires ${Math.abs(walkDiff)} mins less walking, but adds ${timeDiff} mins travel time.`);
        } else if (alt.transfers < topRoute.transfers) {
          tradeOffNotes.push(`Route '${alt.journeyId}' provides a direct / fewer-transfer path (${alt.transfers} vs ${topRoute.transfers}).`);
        }
      }
    }

    if (tradeOffNotes.length === 0 && feasibleRoutes.length > 1) {
      tradeOffNotes.push('Routes present comparable travel profiles with varied modal combinations and transfer points.');
    }

    return {
      totalRoutesCompared,
      feasibleCount,
      infeasibleCount,
      hasDisruptedRoutes,
      hasDuplicates,
      hasNearDuplicates,
      hasTies,
      metricLeaders,
      tradeOffNotes,
      universalBestClaim: false, // Invariant: do not claim one route is universally best
      disclaimer: 'No route is universally superior across all dimensions. Optimal selection depends on student preferences (e.g., speed vs. budget vs. walking tolerance vs. disruption resilience).'
    };
  }

  /**
   * Builds metric ranges (min, max, spread) for charts/sliders in frontend.
   *
   * @private
   */
  _buildMetricRanges(routes) {
    if (routes.length === 0) return {};

    const calcRange = (key) => {
      const vals = routes.map(r => Number(r[key] || 0));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { min, max, spread: max - min };
    };

    return {
      duration: calcRange('totalDuration'),
      cost: calcRange('estimatedCost'),
      walkingTime: calcRange('walkingTime'),
      transfers: calcRange('transfers'),
      disruptionDelay: calcRange('disruptionDelay'),
      deterministicScore: calcRange('deterministicScore')
    };
  }

  /**
   * Summarizes provenance across compared routes.
   *
   * @private
   */
  _buildProvenanceSummary(routes) {
    const tiers = new Set();
    const confidenceBreakdown = {};

    routes.forEach(r => {
      const tier = r.provenance?.sourceTier || r.provenance?.tier || 'ESTIMATED';
      tiers.add(tier);
      confidenceBreakdown[tier] = (confidenceBreakdown[tier] || 0) + 1;
    });

    const dataTiers = Array.from(tiers);
    const allVerified = dataTiers.length === 1 && dataTiers[0] === PROVENANCE_TIERS.VERIFIED;
    const hasUnverifiedData = dataTiers.some(t => t !== PROVENANCE_TIERS.VERIFIED);

    return {
      dataTiers,
      allVerified,
      confidenceBreakdown,
      hasUnverifiedData
    };
  }
}

const routeComparisonService = new RouteComparisonService();

module.exports = {
  RouteComparisonService,
  routeComparisonService,
  DEFAULT_THRESHOLDS
};
