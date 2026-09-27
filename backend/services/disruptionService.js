const { reportRepository } = require('../repositories');

/**
 * Calculates freshness multiplier based on age in milliseconds
 * 0–10 mins: 1.0
 * 10–30 mins: 0.75
 * 30–60 mins: 0.45
 * 60–120 mins: 0.20
 * > 120 mins: 0 (expired)
 */
function calculateFreshnessWeight(createdAt) {
  const ageMinutes = (Date.now() - createdAt) / (60 * 1000);
  if (ageMinutes <= 10) return 1.0;
  if (ageMinutes <= 30) return 0.75;
  if (ageMinutes <= 60) return 0.45;
  if (ageMinutes <= 120) return 0.20;
  return 0.0;
}

function getActiveReports() {
  const now = Date.now();
  const reports = reportRepository.findActive(now);

  return reports.map(report => {
    const r = report.toRow ? report.toRow() : report;
    const freshness = calculateFreshnessWeight(r.created_at);
    const ageMinutes = Math.max(1, Math.round((now - r.created_at) / (60 * 1000)));
    return {
      ...r,
      freshnessWeight: freshness,
      ageMinutes,
      ageFormatted: ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`,
      isConfirmedByCommunity: r.confirmation_count > r.contradiction_count
    };
  }).filter(r => r.freshnessWeight > 0);
}

/**
 * Evaluates candidate route impact against active community reports
 * Returns disruptionScore (0 = clean, 100 = severely blocked) and matching alerts
 */
function evaluateRouteDisruptions(routeCandidate, activeReports) {
  let disruptionPenalty = 0;
  const matchingAlerts = [];

  for (const report of activeReports) {
    let modeMatched = false;
    let locationMatched = false;

    // Check transportation mode match
    const repMode = (report.mode || '').toLowerCase();
    if (routeCandidate.modesIncluded && routeCandidate.modesIncluded.includes(repMode)) {
      modeMatched = true;
    } else if (routeCandidate.primaryMode === repMode) {
      modeMatched = true;
    }

    // Check corridor/location match against route title, subtitle, legs or transit stations
    const searchTarget = [
      routeCandidate.title,
      routeCandidate.subtitle,
      ...(routeCandidate.transitStations || []).map(s => s.name),
      ...(routeCandidate.legs || []).map(l => `${l.from} ${l.to} ${l.description}`)
    ].join(' ').toLowerCase();

    const reportAreaLower = (report.area || '').toLowerCase();
    const reportRouteLower = (report.route_name || '').toLowerCase();

    // Check if area keywords match
    const keywords = [...reportAreaLower.split(/\s+/), ...reportRouteLower.split(/\s+/)].filter(w => w.length > 3);
    for (const kw of keywords) {
      if (searchTarget.includes(kw)) {
        locationMatched = true;
        break;
      }
    }

    // If both mode and location match, compute penalty scaled by freshness and confirmation score
    if (modeMatched || locationMatched) {
      let baseSeverity = 15;
      if (report.impact === 'high') baseSeverity = 40;
      if (report.impact === 'medium') baseSeverity = 25;
      if (report.impact === 'low') baseSeverity = 10;

      // Positive messages (smooth, on-time) decrease disruption penalty
      if (report.message && (report.message.toLowerCase().includes('smooth') || report.message.toLowerCase().includes('on schedule'))) {
        baseSeverity = -10;
      }

      // Net confirmation factor (more confirmations amplify validity; contradictions diminish it)
      const netConfirm = Math.max(0.3, 1 + (report.confirmation_count - report.contradiction_count) * 0.1);
      const effectiveImpact = Math.round(baseSeverity * report.freshnessWeight * Math.min(1.5, netConfirm));

      disruptionPenalty += effectiveImpact;

      matchingAlerts.push({
        id: report.id,
        area: report.area,
        message: report.message,
        impact: report.impact,
        mode: report.mode,
        pseudonym: report.pseudonym,
        ageFormatted: report.ageFormatted,
        freshnessWeight: report.freshnessWeight,
        effectiveImpact,
        label: '⚠ Community reported'
      });
    }
  }

  // Bound disruption penalty between 0 and 100
  const normalizedPenalty = Math.max(0, Math.min(100, disruptionPenalty));

  return {
    disruptionScore: normalizedPenalty,
    alerts: matchingAlerts,
    hasDisruption: matchingAlerts.length > 0
  };
}

module.exports = {
  calculateFreshnessWeight,
  getActiveReports,
  evaluateRouteDisruptions
};
