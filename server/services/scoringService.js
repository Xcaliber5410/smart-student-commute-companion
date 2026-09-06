/**
 * Scoring profiles based on user preference
 */
const WEIGHT_PROFILES = {
  balanced: {
    travelTime: 0.35,
    reliability: 0.25,
    walking: 0.15,
    disruption: 0.10,
    weather: 0.10,
    cost: 0.05
  },
  fastest: {
    travelTime: 0.55,
    reliability: 0.20,
    walking: 0.05,
    disruption: 0.12,
    weather: 0.05,
    cost: 0.03
  },
  cheapest: {
    travelTime: 0.20,
    reliability: 0.15,
    walking: 0.10,
    disruption: 0.05,
    weather: 0.05,
    cost: 0.45
  },
  'rain-safe': {
    travelTime: 0.10,
    reliability: 0.20,
    walking: 0.25,
    disruption: 0.10,
    weather: 0.35,
    cost: 0.00
  }
};

/**
 * Evaluates mode base reliability in Mumbai
 * Metro: 95% (dedicated elevated/underground right of way, AC, immune to street waterlogging)
 * Western / Central Railway: 85% (high throughput, minor monsoon delays)
 * BEST Bus: 75% (subject to arterial traffic, heavy during morning peaks)
 * Auto: 60% (subject to refusal, monsoon availability drops, traffic jams)
 * Walk: 80% (predictable, but highly vulnerable in heavy rain)
 */
function getModeReliability(mode) {
  switch (mode) {
    case 'metro': return 95;
    case 'train': return 85;
    case 'bus': return 75;
    case 'auto': return 62;
    case 'walk': return 80;
    default: return 70;
  }
}

/**
 * Scores each candidate route deterministically
 */
function scoreRoutes(candidates, weather, userPreferences, disruptionEvaluations) {
  if (!candidates || candidates.length === 0) return [];

  const preference = (userPreferences.preference || 'balanced').toLowerCase();
  const weights = WEIGHT_PROFILES[preference] || WEIGHT_PROFILES.balanced;
  const walkingToleranceMin = userPreferences.walkingToleranceMinutes || 20;
  const maxBudget = userPreferences.maxBudgetRupees || 150;

  // Find min/max ranges for normalization
  const durations = candidates.map(c => c.durationMinutes);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations) || minDuration + 1;

  const fares = candidates.map(c => c.fareRupees);
  const minFare = Math.min(...fares);
  const maxFare = Math.max(...fares) || minFare + 1;

  const walks = candidates.map(c => c.walkingDurationMinutes);
  const minWalk = Math.min(...walks);
  const maxWalk = Math.max(...walks) || minWalk + 1;

  const scoredCandidates = candidates.map(candidate => {
    const disruptionEval = disruptionEvaluations[candidate.id] || { disruptionScore: 0, alerts: [] };

    // 1. Travel Time Sub-Score (0 to 100, lower duration = higher score)
    const timeRatio = maxDuration === minDuration ? 1 : 1 - ((candidate.durationMinutes - minDuration) / (maxDuration - minDuration));
    const timeScore = Math.round(timeRatio * 100);

    // 2. Reliability Sub-Score (0 to 100)
    let reliabilityScore = getModeReliability(candidate.primaryMode);
    if (candidate.transfers > 0) {
      reliabilityScore -= candidate.transfers * 6; // Transfer risk penalty
    }

    // 3. Walking Sub-Score (0 to 100)
    // Heavy penalty if user's walking tolerance is exceeded
    let walkRatio = maxWalk === minWalk ? 1 : 1 - ((candidate.walkingDurationMinutes - minWalk) / (maxWalk - minWalk));
    let walkScore = Math.round(walkRatio * 100);
    if (candidate.walkingDurationMinutes > walkingToleranceMin) {
      walkScore = Math.max(0, walkScore - 35);
    }

    // 4. Disruption Sub-Score (0 to 100, lower disruption = higher score)
    const disruptionScore = Math.max(0, 100 - disruptionEval.disruptionScore);

    // 5. Weather Sub-Score (0 to 100)
    // High rain probability penalizes outdoor walking and auto travel; rewards covered Metro/Train
    let weatherScore = 90;
    const rainProb = weather.rainProbability || 0;
    if (rainProb > 40) {
      const walkExposure = candidate.walkingDurationMinutes * (rainProb / 100);
      weatherScore = Math.max(10, Math.round(100 - walkExposure * 3.5));
      if (candidate.primaryMode === 'auto') {
        weatherScore -= 15; // Rain auto unavailability
      } else if (candidate.primaryMode === 'metro') {
        weatherScore += 10; // Rain-sheltered station bonus
      }
    }

    // 6. Cost Sub-Score (0 to 100, cheaper = higher score)
    const costRatio = maxFare === minFare ? 1 : 1 - ((candidate.fareRupees - minFare) / (maxFare - minFare));
    let costScore = Math.round(costRatio * 100);
    if (candidate.fareRupees > maxBudget) {
      costScore = Math.max(0, costScore - 40); // Over-budget penalty
    }

    // Compute composite weighted score
    const compositeScore = Math.round(
      timeScore * weights.travelTime +
      reliabilityScore * weights.reliability +
      walkScore * weights.walking +
      disruptionScore * weights.disruption +
      weatherScore * weights.weather +
      costScore * weights.cost
    );

    return {
      ...candidate,
      scores: {
        composite: compositeScore,
        travelTime: timeScore,
        reliability: reliabilityScore,
        walking: walkScore,
        disruption: disruptionScore,
        weather: weatherScore,
        cost: costScore
      },
      disruptionAlerts: disruptionEval.alerts,
      weatherImpact: {
        rainRisk: weather.rainRisk,
        outdoorExposureMinutes: candidate.walkingDurationMinutes,
        sheltered: candidate.primaryMode === 'metro'
      }
    };
  });

  // Sort by composite score descending
  scoredCandidates.sort((a, b) => b.scores.composite - a.scores.composite);

  // Identify distinct alternatives
  const fastest = [...scoredCandidates].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  const cheapest = [...scoredCandidates].sort((a, b) => a.fareRupees - b.fareRupees)[0];
  const rainSafe = [...scoredCandidates].sort((a, b) => {
    // Metro and lowest walking is most rain safe
    const rainScoreA = (a.primaryMode === 'metro' ? 30 : 0) - a.walkingDurationMinutes * 2;
    const rainScoreB = (b.primaryMode === 'metro' ? 30 : 0) - b.walkingDurationMinutes * 2;
    return rainScoreB - rainScoreA;
  })[0];

  return {
    rankedCandidates: scoredCandidates,
    recommended: scoredCandidates[0],
    fastestAlternative: fastest.id !== scoredCandidates[0].id ? fastest : (scoredCandidates[1] || fastest),
    cheapestAlternative: cheapest.id !== scoredCandidates[0].id ? cheapest : (scoredCandidates[1] || cheapest),
    rainSafeAlternative: rainSafe
  };
}

module.exports = {
  scoreRoutes,
  WEIGHT_PROFILES
};
