# Smart Student Commute Companion - Recommendation & Explanation API Schema

This document defines the REST API contract for the personalized commute recommendation and contextual explanation endpoints.

---

## 1. Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/commute/recommendations` | Primary commute recommendation and explanation endpoint | Yes (`Bearer <token>`) |
| `POST` | `/api/student/commute/recommendations` | Convenience alias under the student namespace | Yes (`Bearer <token>`) |

---

## 2. Request Headers

```http
Authorization: Bearer <JWT_STUDENT_TOKEN>
Content-Type: application/json
```

---

## 3. Request Body Schema

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `origin` | string | Optional* | Starting area, station, or landmark. *(Required if no saved commute profile)* | `"Borivali West"` |
| `destination` | string | Optional | Campus destination. Defaults to `"D.J. Sanghvi College of Engineering"`. | `"D.J. Sanghvi College of Engineering"` |
| `desiredDepartureTime` | string (HH:MM) | Optional | Desired departure time in 24-hour IST format. | `"08:00"` |
| `departureTime` | string (HH:MM) | Optional | Alias for `desiredDepartureTime`. | `"08:00"` |
| `desiredArrivalTime` | string (HH:MM) | Optional | Hard arrival deadline in 24-hour IST format. | `"09:00"` |
| `targetArrivalTime` | string (HH:MM) | Optional | Alias for `desiredArrivalTime`. | `"09:00"` |
| `routePreference` | string | Optional | Optimization objective: `'fastest'`, `'cheapest'`, `'fewest_transfers'`, `'least_walking'`, `'reliable'`, `'rain-safe'`, or `'balanced'`. | `"fastest"` |
| `preferredModes` | string[] | Optional | Preferred transit modes: `['train', 'metro', 'bus', 'auto', 'shared_auto', 'walk']`. | `["metro", "train"]` |
| `avoidModes` | string[] | Optional | Modes to avoid or penalize. | `["bus"]` |
| `maxWalkingMinutes` | number | Optional | Maximum allowable walking time in minutes (0–60). | `15` |
| `maxBudgetRupees` | number | Optional | Maximum transit budget in INR (0–2000). | `50` |
| `maxTransfers` | number | Optional | Maximum allowable interchange transfers (0–5). | `2` |
| `date` | string | Optional | Commute date or day code (e.g. `"Mon"`, `"2026-10-12"`). | `"Mon"` |

> [!NOTE]
> **Privacy-by-Design**: Do NOT provide precise residential door/flat numbers or raw GPS coordinates (`latitude`/`longitude`). Only coarse area names and transit hubs are permitted.

---

## 4. Response TypeScript Interfaces

```typescript
export interface CommuteRecommendationResponse {
  success: boolean;
  timestamp: string;
  hasFeasibleRoute: boolean;
  hasSuccessfulRecommendation: boolean;
  isFallback: boolean;
  status: 'RECOMMENDED' | 'FEASIBLE' | 'CAUTION' | 'DEGRADED' | 'FALLBACK';
  fallbackReason: string | null;
  fallbackGuidance: string[];

  // 1. Primary Recommendation
  primaryRecommendation: RecommendedRouteDetail | null;
  selectedRoute: RecommendedRouteDetail | null;

  // 2. Meaningful Alternative Routes
  alternativeRoutes: RecommendedRouteDetail[];
  meaningfulAlternatives: RecommendedRouteDetail[];

  // 3. Selection Reasons
  selectionReason: string | null;
  recommendationReasons: RecommendationReason[];

  // 4. Relevant Schedule Context
  scheduleContext: ScheduleContext | null;
  scheduleContextUsed: ScheduleContext | null;

  // 5. Arrival & Departure Advice
  arrivalAdvice: ArrivalAdvice | null;
  departureAdvice: DepartureAdvice | null;

  // 6. Trade-offs
  routeTradeOffs: string[];

  // 7. Disruption Effects
  disruptionEffects: DisruptionEffects;
  disruptionSummary: {
    delayMinutes: number;
    warnings: string[];
  };

  // 8. Provenance
  provenance: DataProvenanceRecord | null;
  provenanceSummary: ProvenanceSummary | null;

  // 9. Qualitative Uncertainty & Data Quality Warnings
  uncertaintyDetails: DataQualityAndUncertainty | null;
  dataQualityWarnings: string[];
  missingDataWarnings: string[];

  // 10. Explanation Method
  explanationMethod: 'deterministic' | 'ai-assisted';
  explanationMode: 'DETERMINISTIC' | 'AI_ASSISTED';
  isAiEnhanced: boolean;
  explanationAudit: ExplanationAudit | null;
}

export interface RecommendedRouteDetail {
  journeyId: string;
  origin: string;
  destination: string;
  departureTime: string;
  estimatedArrivalTime: string;
  totalTravelTimeMinutes: number;
  walkingTimeMinutes: number;
  transfers: number;
  estimatedCostRupees: number | null;
  primaryMode: 'train' | 'metro' | 'bus' | 'auto' | 'shared_auto' | 'walk';
  modesIncluded: string[];
  expectedDisruptionDelayMinutes: number;
  reliability: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  uncertainty: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  provenance: DataProvenanceRecord;
}

export interface RecommendationReason {
  category: 'SCHEDULE_ALIGNMENT' | 'DISRUPTION_AVOIDANCE' | 'FEWER_TRANSFERS' | 'COST_EFFICIENCY' | 'MODE_PREFERENCE' | 'FALLBACK_GUIDANCE';
  headline: string;
  detail: string;
  priority: number;
  dataTier: 'VERIFIED' | 'USER_REPORTED' | 'ESTIMATED' | 'SYNTHETIC';
}

export interface ScheduleContext {
  hasScheduleContext: boolean;
  source: 'ACADEMIC_EVENT' | 'RECURRING_SCHEDULE' | 'EXPLICIT_INPUT' | 'NONE';
  eventTitle: string | null;
  eventStartTime: string | null;
  targetArrivalTime: string | null;
  location: string | null;
  isDestinationMatched: boolean;
  bufferMinutes: number;
  isExamDay: boolean;
  hasScheduleConflict: boolean;
  scheduleConflictDetail: string | null;
  summary: string;
}

export interface ArrivalAdvice {
  estimatedArrivalTime: string | null;
  targetArrivalTime: string | null;
  onTimeStatus: 'ON_TRACK' | 'TIGHT_MARGIN' | 'UNACHIEVABLE' | 'UNKNOWN';
  bufferMinutes: number;
  isEarlierDepartureRecommended: boolean;
  recommendedDepartureTime: string | null;
}

export interface DepartureAdvice {
  isEarlierDepartureRecommended: boolean;
  earlierByMinutes: number;
  recommendedDepartureTime: string;
  targetArrivalTime: string;
  journeyDurationMinutes: number;
  disruptionDelayMinutes: number;
  onTimeStatus: 'ON_TRACK' | 'TIGHT_MARGIN' | 'UNACHIEVABLE';
  reasons: string[];
  actionableGuidance: string[];
}

export interface DisruptionEffects {
  delayMinutes: number;
  hasDisruptions: boolean;
  advisories: string[];
  affectedSegments: any[];
}

export interface ProvenanceSummary {
  dataTiers: ('VERIFIED' | 'USER_REPORTED' | 'ESTIMATED' | 'SYNTHETIC')[];
  overallTier: 'VERIFIED' | 'USER_REPORTED' | 'ESTIMATED' | 'SYNTHETIC';
  allVerified: boolean;
  hasSyntheticData: boolean;
  hasUserReportedData: boolean;
  hasUnverifiedData: boolean;
}

export interface DataQualityAndUncertainty {
  uncertaintyLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  indicators: {
    type: string;
    description: string;
    severity: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  }[];
  dataQualityWarnings: string[];
  missingDataNotice: string | null;
  hasSyntheticData: boolean;
  hasStaleData: boolean;
  hasMissingData: boolean;
  liveFeedStatus: {
    hasLiveGps: boolean;
    trackingMode: string;
    statement: string;
  };
}

export interface ExplanationAudit {
  mode: 'AI_ASSISTED' | 'DETERMINISTIC';
  isAiEnhanced: boolean;
  provider: string;
  fallbackOccurred: boolean;
  fallbackReason: string | null;
  validationPassed: boolean;
  statement: string;
}
```

---

## 5. UI Integration Guidelines

1. **Deterministic Authority**:
   - Route feasibility, ranking, and timings are 100% deterministic mathematical calculations.
   - The `explanationMethod` indicates whether an optional AI adapter was used to phrase the natural language explanation (`'ai-assisted'`) or whether offline deterministic rules generated it (`'deterministic'`).
2. **Qualitative Uncertainty**:
   - The engine **never** invents numerical percentages (e.g. "93% certainty").
   - Display uncertainty using qualitative badges: `LOW`, `MODERATE`, `HIGH`, or `SEVERE`.
3. **Missing Data Distinction**:
   - If `hasMissingData: true` (e.g. unmetered taxi leg), show an informational tip:
     *"Fare is unmetered; this does NOT indicate the service is unavailable or unsafe."*
4. **4-Tier Provenance Badging**:
   - `VERIFIED`: Official timetable records and published fare rules.
   - `USER_REPORTED`: Crowdsourced delay reports and commuter alerts.
   - `ESTIMATED`: Algorithmic walking speed projections and historical traffic estimates.
   - `SYNTHETIC`: Benchmark or simulated planner artifacts. Never label synthetic data as verified.
