# Completed Features — Smart Student Commute Companion

This document tracks verified, implemented backend and frontend features in the Smart Student Commute Companion codebase. It accurately reflects tested, operational functionality without claiming aspirational AI recommendation features that do not exist.

---

## Day 17: Commute Route Intelligence Pipeline

The Day 17 backend implementation establishes an end-to-end, deterministic commute route intelligence pipeline connecting student commute queries to structured, comparable route options with full multi-source provenance.

### Verified Pipeline Stages
```
Student Commute Input (POST /api/commute/candidates)
  ↓
Candidate Route Generation (CandidateRouteEngine / JourneyBuilderService)
  ↓
Disruption & Unified Context Analysis (CommuteContextEngine)
  ↓
Deterministic Constraint Filtering (RouteConstraintFilteringService)
  ↓
Alternate Route Generation (AlternateRouteService)
  ↓
Route Evaluation & Weakness Extraction (RouteEvaluationService)
  ↓
Deterministic Route Scoring (DeterministicRouteScoringService)
  ↓
Multi-Criteria Route Comparison (RouteComparisonService)
  ↓
API Response Envelope (commuteCandidateController)
```

---

### Features Implemented & Hardened

#### 1. Route Evaluation Domain Model (`RouteEvaluation`)
- **Location**: `backend/models/RouteEvaluation.js`, `backend/services/routeEvaluationService.js`
- **Capabilities**:
  - Consolidates baseline journey schedule metrics and contextual real-time environmental impacts (disruptions, road traffic, weather, service availability).
  - Normalizes total travel time, disruption delays, waiting time, walking burden, transfers, and cost.
  - Transparently extracts explainable route weaknesses:
    - `HIGH_WALKING_BURDEN` (>15 min default threshold)
    - `EXCESSIVE_TRANSFERS` (≥2 transfers)
    - `HIGH_WAITING_TIME` (>10 min waiting)
    - `HIGH_UNCERTAINTY` (HIGH or SEVERE risk)
    - `HIGH_COST` (>₹60 student budget)
    - `DISRUPTION_DELAY`, `ROAD_TRAFFIC_CONGESTION`, `SEVERE_TRAFFIC`, `WEATHER_IMPACT`
    - `SERVICE_UNAVAILABLE`, `SERVICE_SUSPENDED`, `JOURNEY_INFEASIBLE`
  - Reuses existing `CommuteJourney`, `CommuteContextEngine`, and `UnifiedJourneyImpact` contracts.
  - Carries multi-source data provenance across all 4 tiers without masking lower-confidence sources.

#### 2. Deterministic Route Scoring Engine (`DeterministicRouteScoringService`)
- **Location**: `backend/services/deterministicRouteScoringService.js`, `backend/services/routeScoringService.js`
- **Capabilities**:
  - Transparent, explainable 100-point composite scoring model:
    - **Travel Time Score** (35 pts max): Log-linear decay from student acceptable thresholds.
    - **Reliability & Disruption Score** (25 pts max): Penalties for disruption delay, traffic, and uncertainty.
    - **Comfort & Transfers Score** (20 pts max): Modal convenience penalties (transfers, modal penalties).
    - **Cost & Budget Score** (10 pts max): Fare penalties proportional to student budget.
    - **Walking Burden Score** (10 pts max): Excessive walking distance/fatigue penalties.
  - Deterministic tie-breaking rules (composite score → travel time → transfer count → walking minutes → journey ID).
  - Zero non-deterministic random scoring or LLM hallucinations.
  - No false claims that one route is universally optimal.

#### 3. Alternate Route Generation Engine (`AlternateRouteService`)
- **Location**: `backend/services/alternateRouteService.js`
- **Capabilities**:
  - Generates viable fallback alternatives when primary routes are disrupted or infeasible.
  - 4 Deterministic Alternate Strategies:
    - `MODE_SHIFT`: Switches mode (e.g. transit to auto/walk or vice versa).
    - `SCHEDULE_SHIFT`: Adjusts scheduled departure window to avoid peak delays.
    - `CORRIDOR_SHIFT`: Uses parallel suburban corridors (e.g. Metro Line 1 vs. Western Railway).
    - `STATION_SHIFT`: Routes through alternate nearby interchange stations.
  - Strict deduplication: Seeds candidate signatures so alternates never duplicate primary candidate routes.
  - Enforces route viability and preserves full strategy rationale metadata.

#### 4. Route Constraint Filtering Stage (`RouteConstraintFilteringService`)
- **Location**: `backend/services/routeConstraintFilteringService.js`
- **Capabilities**:
  - Deterministically partitions routes into accepted and rejected categories.
  - Cleanly separates:
    - **HARD Constraints** (disqualify routes): Arrival deadline (`ARRIVAL_TOO_LATE`), Max walking time (`WALKING_LIMIT_EXCEEDED`), Max transfers (`TOO_MANY_TRANSFERS`), Cost ceiling (`BUDGET_EXCEEDED`), Excluded modes (`EXCLUDED_MODE`), Service availability (`SERVICE_UNAVAILABLE`, `SERVICE_SUSPENDED`), Route disruption feasibility (`ROUTE_DISRUPTED`).
    - **SOFT Preferences** (influence ranking downstream): Preferred modes (`preferredModes`), Balanced/fastest/cheapest route preferences.
  - **Non-Discard Invariant**: Rejected routes are preserved with full violation reason codes and metrics.

#### 5. Multi-Criteria Route Comparison Service (`RouteComparisonService`)
- **Location**: `backend/services/routeComparisonService.js`
- **Capabilities**:
  - Exposes 14 structured, comparable attributes per route:
    1. Estimated arrival time
    2. Total duration
    3. Disruption delay
    4. Waiting time
    5. Walking time
    6. Transfers
    7. Estimated cost
    8. Reliability / uncertainty
    9. Affected segments
    10. Transport modes
    11. 4-tier data provenance
    12. Deterministic score & breakdown
    13. Strengths
    14. Weaknesses
  - Detects duplicate and near-duplicate journeys.
  - Computes metric extremes and leaders across candidate pools.
  - Dedicated `comparePair()` head-to-head comparison for trade-off analysis.
  - Aggregates provenance summary (`allVerified`, `hasUnverifiedData`, `dataTiers`).

#### 6. Route Intelligence API Endpoint (`POST /api/commute/candidates`)
- **Location**: `backend/controllers/commuteCandidateController.js`, `backend/routes/commuteRoutes.js`
- **Capabilities**:
  - Single endpoint exposing complete intelligence envelope:
    - `feasibleRoutes`: Viable routes meeting all hard constraints, ranked with deterministic scores.
    - `rejectedRoutes`: Invalid routes with transparent violation codes and messages.
    - `alternateRoutes`: Viable fallback routes with strategy metadata and comparison metrics.
    - `routeComparison`: Structured multi-criteria comparison matrix and metric spreads.
    - `provenanceMetadata`: Explicit audit trail of all contributing data tiers.
    - `routeIntelligence`: Consolidated payload with context summary, provenance summary, and non-recommendation disclaimer.
  - Clearly distinguishes baseline estimates vs. contextual real-time estimates.
  - Enforces JWT authentication, Zod schema validation, and student privacy boundaries (rejects raw coordinates, PIN codes, and flat numbers).

#### 7. Integration Pipeline Hardening Test Suite
- **Location**: `backend/scripts/integration_commute_pipeline_hardening_test.js`
- **Command**: `npm run test:pipeline-hardening`
- **Status**: 20/20 Scenarios Passing
  1. Normal commute with multiple feasible routes (clean baseline, no disruption delay)
  2. Train/metro delay (delays reflected, arrival time shifted contextually)
  3. Bus unavailable (unavailable segment flagged with availability reason)
  4. Heavy traffic (road routes show added travel duration and elevated uncertainty)
  5. Weather disruption (walking inconvenience scored, uncertainty elevated)
  6. Multiple simultaneous disruptions (delays aggregated, tracked across multiple modes)
  7. One route becoming infeasible (infeasible route marked `isFeasible: false` without dropping viable alternatives)
  8. Alternate route generation (outputs `ALTERNATE_ROUTE` with strategy metadata)
  9. Arrival-time constraint (rejects routes arriving past target deadline with `ARRIVAL_TOO_LATE`)
  10. Walking constraint (rejects routes exceeding `maxWalkingMinutes` with `WALKING_LIMIT_EXCEEDED`)
  11. Transfer constraint (rejects routes exceeding `maxTransfers` with `TOO_MANY_TRANSFERS`)
  12. No feasible route (empty `feasibleRoutes`, itemized `rejectedRoutes` with violations)
  13. VERIFIED provenance (timetabled rail/metro data carries `VERIFIED` tier)
  14. USER_REPORTED provenance (crowdsourced reports inject `USER_REPORTED` tier)
  15. ESTIMATED provenance (road traffic and heuristic calculations inject `ESTIMATED` tier)
  16. SYNTHETIC provenance (fallback/synthetic data labeled `SYNTHETIC` without masking)
  17. Duplicate alternative prevention (alternates never duplicate primary candidate routes)
  18. Deterministic scoring repeatability (identical queries yield identical composite scores and ranks)
  19. Expired disruptions (stale or resolved disruptions do not affect routes)
  20. Mixed disruption/context data (combines multi-tier context; flags `hasUnverifiedData: true`)

#### 8. Personalized Commute Recommendations Pipeline
- **Domain Models**: `backend/models/PersonalizedCommuteRecommendation.js`, `backend/models/PersonalizedRecommendationExplanation.js`, `backend/models/DepartureAdvice.js`
  - Encapsulates `PersonalizedCommuteRecommendation`, `RecommendedRouteDetail`, `PreferenceAlignment`, `RecommendationReason`, `TradeOffItem`, `PersonalizedRecommendationExplanation`, and `DepartureAdvice`.
  - Distinguishes hard constraints from soft preferences without conflation.
  - Transparent fallback representation (`isFallback: true`) with actionable student guidance when no feasible routes exist.
- **Personalized Deterministic Scoring**: `backend/services/deterministicRouteScoringService.js`
  - Supports 5 preference profiles (`balanced`, `faster`, `cheaper`, `fewest_transfers`, `least_walking`, `reliable`, `rain-safe`).
  - Strict enforcement of hard constraints (`ARRIVAL_TOO_LATE`, `TOO_MANY_TRANSFERS`, `WALKING_LIMIT_EXCEEDED`, `BUDGET_EXCEEDED`, `EXCLUDED_MODE`, `DISALLOWED_MODE`).
  - Missing preferences fallback safely to documented, sensible defaults.
- **Personalized Route Recommendation Service**: `backend/services/personalizedRouteRecommendationService.js`
  - Complete 6-stage pipeline: candidate generation/acquisition → hard constraint filtering → disruption/context evaluation → alternate route discovery → deduplication → personalized ranking & recommendation selection.
  - Generates primary recommended route, up to 3 meaningfully distinct alternatives, pairwise trade-offs, and grounded explanations.
- **Recommendation Explanation Service**: `backend/services/recommendationExplanationService.js`
  - Generates structured, truthful explanations grounded strictly in actual route metrics, constraints, preferences, and context without fabrication.
  - Distinguishes 4 provenance tiers (`VERIFIED`, `USER_REPORTED`, `ESTIMATED`, `SYNTHETIC`).
- **Disruption-Aware Departure Advice Service**: `backend/services/departureAdviceService.js`
  - Recommends justified earlier departure windows when disruptions or tight schedules endanger arrival deadlines.
  - Checks Mumbai transit operating hours and warns if planned departures violate service schedules.
- **Personalized Recommendations API Endpoint**: `POST /api/commute/recommendations`
  - Location: `backend/controllers/commuteRecommendationController.js`, `backend/routes/commuteRoutes.js`
  - Returns primary route, distinct alternatives, disruption summary, preference alignment, recommendation reasons, route trade-offs, departure advice, provenance summary, and explanation.
  - Enforces JWT authentication, Zod validation, and privacy safeguards (rejects granular door/flat numbers and coordinate fields).

#### 9. Master Integration Verification: Personalized Commute Recommendations
- **Location**: `backend/scripts/integration_personalized_recommendations_verification_test.js`
- **Command**: `npm run test:recommendations-verification`
- **Status**: 21/21 Scenarios Passing
  1. Normal commute with multiple feasible routes
  2. Faster-route preference prioritizes minimal commute duration
  3. Lower-cost preference prioritizes lowest transit fare
  4. Fewer-transfers preference favors direct routes over complex interchanges
  5. Reduced-walking preference prioritizes low pedestrian exertion
  6. Preferred transport modes gives decisive score boost to preferred mode
  7. Hard constraints strictly override soft preferences
  8. Train or metro disruption adds delay buffer and pivots to undisrupted alternate
  9. Bus unavailability penalizes or eliminates suspended bus corridor
  10. Multiple simultaneous disruptions aggregate delay buffers and elevate caution
  11. Earlier-departure advice when justified recommends earlier departure
  12. Arrival deadline that cannot be met reports honest unachievable status
  13. No feasible routes returns clean fallback result with actionable suggestions
  14. Missing or incomplete transport data handled safely without crashes or NaN
  15. Multi-tier provenance preserves all 4 tiers without mislabeling
  16. Explanations faithfully reflect actual route metrics without fabrication
  17. Deterministic recommendations produce identical outputs for repeated inputs
  18. Duplicate alternative prevention eliminates near-identical route copies
  19. Expired disruptions do not penalize current routes or inflate delays
  20. Authentication, validation, and privacy safeguards enforced strictly
  21. Existing backend endpoints and contracts remain intact without regressions

#### 10. Contextual Personalization Layer
- **Domain Model**: `backend/models/ContextualCommutePersonalization.js`
  - Encapsulates normalized student context for the commute recommendation engine via `ContextualCommutePersonalization` and `CONTEXT_SOURCES`.
  - Clear source attribution tags for every resolved attribute:
    - `EXPLICIT_INPUT`: Directly specified in the commute request payload (highest precedence).
    - `ACADEMIC_EVENT`: Derived from scheduled lectures, labs, exams, or assignment deadlines in student calendar.
    - `RECURRING_SCHEDULE`: Derived from recurring weekly student timetable / schedule patterns.
    - `SAVED_PREFERENCE`: Derived from saved student commute preferences / profile defaults.
    - `DERIVED_CONTEXT`: Inferred from workload level, exam presence, or geographic anchors.
    - `DEFAULT`: Documented, sensible system fallback when student context is absent.
  - Strict privacy guarantees: `noContinuousTracking: true`, `coarseLocationOnly: true`, and zero home-address history persistence.
- **Service**: `backend/services/contextualPersonalizationService.js`
  - Safely collects student context across `studentCommutePreferenceRepository`, `calendarEventRepository`, `studentScheduleRepository`, and `workloadAnalysisService`.
  - Safe error handling: DB or repository errors fall back smoothly to sensible defaults without failing the commute request.
  - Contextual awareness:
    - Automatically discovers today's next scheduled class start time and campus destination.
    - Applies academic punctuality buffers (10-15 min for classes; elevated 20-30 min for exams with `isExamDay: true`).
    - Flags heavy workload days (`isHeavyDay: true`, `loadLevel: 'HEAVY'`) to prompt reliable transit modes and extra margin.
  - Strict student access isolation (`assertStudentAccess`): blocks unauthorized students from accessing other students' calendar or preferences (`ForbiddenError`).
- **API Integration**: `POST /api/commute/recommendations`
  - Replaced manual profile lookup with `contextualPersonalizationService.collectStudentContext()`.
  - Exposes normalized, privacy-safe `studentContext` with transparent source provenance in both success and fallback responses.
- **Automated Verification**:
  - `backend/scripts/test_contextual_commute_personalization.js` (`npm run test:contextual-personalization`)
  - 13/13 test scenarios covering anonymous requests, missing academic context, lecture derivation, explicit overrides, exam buffers, recurring schedules, saved preferences, heavy workload flagging, student authorization barriers, privacy guardrails, safe repository failure fallbacks, clean serialization, and HTTP API integration.

---

## Known Boundaries & Non-Claims
- **No AI Guesswork / Speculation**: All route scores, rankings, departure windows, and explanations are 100% deterministic mathematical calculations based on timetables, disruptions, traffic levels, and weather.
- **Transparent Provenance**: Grounded in multi-tier audit trails (`VERIFIED`, `USER_REPORTED`, `ESTIMATED`, `SYNTHETIC`) without inventing unverified facts or live transit tracking.
- **No Fabrication of Academic Schedules**: Students without scheduled calendar entries are never assumed to have classes. Missing context falls back safely to user input or documented defaults.


