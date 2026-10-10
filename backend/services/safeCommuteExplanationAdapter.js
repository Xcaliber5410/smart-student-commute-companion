/**
 * SafeCommuteExplanationAdapter
 *
 * Optional AI-assisted explanation adapter for personalized commute recommendations.
 *
 * Guaranteed Properties:
 * 1. Authority: Deterministic recommendation selection remains 100% authoritative.
 *    The AI layer never selects routes, alters scores, overrides constraints, or invents transport data.
 * 2. Privacy-Safe: Never sends precise home addresses, door numbers, GPS coordinates, or student PII.
 * 3. Strict Validation: Validates and constrains AI output against underlying candidate metrics.
 * 4. Resilient Fallback: Falls back seamlessly to deterministic explanations on timeout, provider error,
 *    validation failure, or missing credentials.
 * 5. Bounded Timeouts: Enforces strict call timeouts (default 4000ms).
 * 6. Non-Mandatory: AI is purely optional; the entire commute pipeline operates without credentials.
 */

const axios = require('axios');
const config = require('../config');
const {
  PersonalizedRecommendationExplanation
} = require('../models/PersonalizedRecommendationExplanation');
const { PROVENANCE_TIERS } = require('../models/CommuteContracts');

/**
 * Standard AI Fallback Reason Codes
 */
const AI_FALLBACK_REASONS = Object.freeze({
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  TIMEOUT: 'TIMEOUT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DISABLED: 'DISABLED'
});

// ============================================================================
// 1. PROVIDER INTERFACE & IMPLEMENTATIONS
// ============================================================================

/**
 * Base AI Commute Explanation Provider Interface
 */
class AiCommuteExplanationProvider {
  constructor(name = 'BaseProvider') {
    this.name = name;
    this.model = 'generic-model';
  }

  /**
   * Checks whether the provider is configured and ready to execute.
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * Generates natural language explanation from structured payload.
   * @param {object} payload - Privacy-safe prompt payload
   * @param {object} [options={}] - Execution options
   * @returns {Promise<object>} Parsed AI explanation object
   */
  async generateExplanation(payload, options = {}) {
    throw new Error('generateExplanation must be implemented by subclass');
  }
}

/**
 * Google Gemini Provider Implementation
 * Uses official @google/genai SDK or direct REST API with config.geminiApiKey.
 */
class GeminiCommuteExplanationProvider extends AiCommuteExplanationProvider {
  constructor(options = {}) {
    super('Gemini Commute Explainer');
    this.apiKey = options.apiKey !== undefined ? options.apiKey : (config.geminiApiKey || '');
    this.model = options.model || 'gemini-2.5-flash';
    this.timeoutMs = options.timeoutMs || 4000;
  }

  isConfigured() {
    return Boolean(this.apiKey && typeof this.apiKey === 'string' && this.apiKey.trim().length > 0);
  }

  async generateExplanation(payload, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const timeout = options.timeoutMs || this.timeoutMs;
    const systemInstruction = `You are the Smart Student Commute Companion AI for Mumbai college commutes.
CRITICAL INTEGRITY INSTRUCTIONS:
1. You turn pre-computed, deterministic commute recommendations into clear, student-friendly natural language.
2. DO NOT invent or fabricate transit routes, bus numbers, train lines, station stops, fares, departure times, travel durations, or weather.
3. DO NOT claim travel duration is shorter or longer than the verified metric provided.
4. DO NOT claim synthetic data is verified.
5. If active transit delays or trade-offs are provided, explain them accurately based on evidence.
6. Output strictly valid JSON with this exact structure:
{
  "summary": "1-2 sentence clear recommendation summary",
  "selectionReason": "Concise paragraph explaining why this route was selected over alternatives",
  "tradeOffSummary": "Brief natural language summary of trade-offs against alternatives",
  "disruptionSummary": "Brief summary of active disruption delays and corridor effects",
  "uncertaintySummary": "Brief summary of data bounds, missing fare notes, or traffic variance"
}`;

    // Attempt @google/genai SDK first if installed
    let GoogleGenAI;
    try {
      GoogleGenAI = require('@google/genai').GoogleGenAI;
    } catch (e) {
      GoogleGenAI = null;
    }

    if (GoogleGenAI) {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const response = await ai.models.generateContent({
        model: this.model,
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nContext Facts:\n${JSON.stringify(payload, null, 2)}` }] }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });

      if (response && response.text) {
        return JSON.parse(response.text.trim());
      }
    }

    // Direct REST fallback
    const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const restRes = await axios.post(restUrl, {
      contents: [
        { parts: [{ text: `${systemInstruction}\n\nContext Facts:\n${JSON.stringify(payload, null, 2)}` }] }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, { timeout });

    const text = restRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini REST endpoint');
    }
    return JSON.parse(text.trim());
  }
}

/**
 * Deterministic Commute Explanation Provider
 * Produces grounded, predictable explanations without external network calls.
 */
class DeterministicCommuteExplanationProvider extends AiCommuteExplanationProvider {
  constructor() {
    super('Deterministic Grounded Engine');
    this.model = 'deterministic-rules-v1';
  }

  isConfigured() {
    return true;
  }

  async generateExplanation(payload) {
    const primary = payload.primaryRoute;
    const summary = payload.deterministicSummary ||
      `Recommended route via ${primary.primaryMode.toUpperCase()} (${primary.totalTravelTimeMinutes} min, ${primary.transfers} transfers).`;
    const selectionReason = payload.deterministicSelectionReason ||
      `Selected route providing optimal commute duration of ${primary.totalTravelTimeMinutes} minutes.`;

    return {
      summary,
      selectionReason,
      tradeOffSummary: payload.tradeOffs?.[0] || 'Direct connection on evaluated corridor.',
      disruptionSummary: primary.disruptionDelayMinutes > 0
        ? `Includes +${primary.disruptionDelayMinutes}m reported corridor congestion buffer.`
        : 'Zero active transit delays reported on this corridor.',
      uncertaintySummary: payload.uncertainty?.missingCost
        ? 'Fare estimate is unmetered or unavailable.'
        : 'Timetabled travel projections.'
    };
  }
}

/**
 * Mock Provider for testing purposes
 */
class MockAiCommuteExplanationProvider extends AiCommuteExplanationProvider {
  constructor(options = {}) {
    super('Mock AI Provider');
    this.model = 'mock-model';
    this.mockOutput = options.mockOutput || null;
    this.delayMs = options.delayMs || 0;
    this.shouldFail = Boolean(options.shouldFail || options.shouldError);
    this.errorMessage = options.errorMessage || 'Mock provider failed';
    this.configured = options.isConfigured !== undefined ? options.isConfigured : true;
    this.lastPayload = null;
  }

  isConfigured() {
    return this.configured;
  }

  async generateExplanation(payload) {
    this.lastPayload = payload;
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    if (this.mockOutput) {
      return typeof this.mockOutput === 'function' ? this.mockOutput(payload) : this.mockOutput;
    }
    return {
      summary: `AI recommended route via ${payload.primaryRoute.primaryMode.toUpperCase()} in ${payload.primaryRoute.totalTravelTimeMinutes} minutes.`,
      selectionReason: `Selected as the fastest feasible option taking ${payload.primaryRoute.totalTravelTimeMinutes} minutes with ${payload.primaryRoute.transfers} transfers.`,
      tradeOffSummary: 'Balanced transit connection.',
      disruptionSummary: 'Operating on clear corridors.',
      uncertaintySummary: 'Grounded in timetables.'
    };
  }
}

// ============================================================================
// 2. PRIVACY-SAFE PAYLOAD BUILDER
// ============================================================================

/**
 * Scrubs precise address details down to coarse geographic transit areas.
 * Strips room/door numbers, apartment names, coordinates, and private notes.
 *
 * @param {string} location
 * @returns {string}
 */
function sanitizeCoarseArea(location) {
  if (!location || typeof location !== 'string') return 'Departure Area';

  // Strip coordinate patterns like "19.1234, 72.8361" or standalone decimal coordinates
  let cleaned = location
    .replace(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g, '')
    .replace(/\b\d+\.\d{3,}\b/g, '')
    // Strip internal room numbers, flat numbers, door numbers, building numbers
    .replace(/(?:flat|room|apt|door|house|building|bldg|plot|no\.?)\s*#?\s*\w+[\s,]*/gi, '')
    .replace(/\b\d{6}\b/g, '') // Indian PIN codes
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  // If over-stripped or empty, return coarse default
  if (!cleaned || cleaned.length < 2) {
    return 'Departure Area';
  }

  return cleaned;
}

/**
 * Builds a strictly privacy-safe, minimal structured prompt payload.
 *
 * INVARIANTS:
 * - NO user IDs, student IDs, emails, bearer tokens, or secrets.
 * - NO precise door numbers, GPS coordinates, or location histories.
 * - ONLY coarse zone names and pre-computed route metrics.
 *
 * @param {object} recommendation - Recommendation context
 * @param {object} deterministicExplanation - Authoritative explanation
 * @returns {object} Privacy-safe payload
 */
function buildPrivacySafePromptPayload(recommendation, deterministicExplanation) {
  const selected = recommendation.selectedRoute || {};
  const alts = recommendation.alternativeRoutes || [];
  const timing = deterministicExplanation?.timingExplanation || {};
  const disruption = deterministicExplanation?.disruptionEffects || {};
  const academic = deterministicExplanation?.academicScheduleExplanation || {};
  const departureAdvice = recommendation.departureAdvice || {};

  const totalDuration = Number(
    selected.totalTravelTimeMinutes ??
    selected.totalDurationMinutes ??
    timing.travelTimeMinutes ??
    30
  );

  const transfers = Number(selected.transfers ?? selected.numberOfTransfers ?? 0);
  const cost = selected.estimatedCostRupees !== undefined && selected.estimatedCostRupees !== null
    ? Number(selected.estimatedCostRupees)
    : null;

  const isSynthetic = selected.provenance?.sourceTier === PROVENANCE_TIERS.SYNTHETIC;
  const isFastest = alts.length === 0 || alts.every(a => {
    const aDur = Number(a.totalTravelTimeMinutes ?? a.totalDurationMinutes ?? 999);
    return aDur >= totalDuration;
  });

  return {
    originArea: sanitizeCoarseArea(selected.origin || recommendation.origin),
    destinationCampus: sanitizeCoarseArea(selected.destination || recommendation.destination || 'D.J. Sanghvi College of Engineering'),
    primaryRoute: {
      journeyId: selected.journeyId || 'route-primary',
      primaryMode: String(selected.primaryMode || 'transit').toLowerCase(),
      totalTravelTimeMinutes: totalDuration,
      departureTime: selected.departureTime || timing.departureTime || '08:00',
      estimatedArrivalTime: selected.estimatedArrivalTime || timing.estimatedArrivalTime || '08:30',
      transfers,
      walkingTimeMinutes: Number(selected.walkingTimeMinutes ?? 5),
      estimatedCostRupees: cost,
      disruptionDelayMinutes: Number(selected.expectedDisruptionDelayMinutes ?? disruption.delayMinutes ?? 0),
      isSynthetic,
      isFastest
    },
    alternativesSummary: alts.map(a => ({
      primaryMode: String(a.primaryMode || 'transit').toLowerCase(),
      totalTravelTimeMinutes: Number(a.totalTravelTimeMinutes ?? a.totalDurationMinutes ?? 0),
      transfers: Number(a.transfers ?? a.numberOfTransfers ?? 0),
      estimatedCostRupees: (a.estimatedCostRupees !== undefined && a.estimatedCostRupees !== null) ? Number(a.estimatedCostRupees) : null
    })),
    deterministicSummary: deterministicExplanation?.summary || '',
    deterministicSelectionReason: deterministicExplanation?.selectionReason || '',
    tradeOffs: deterministicExplanation?.tradeOffs || [],
    activeDisruptions: disruption.advisories || [],
    satisfiedPreferences: (deterministicExplanation?.satisfiedPreferences || []).map(p => p.preference),
    academicSchedule: academic.hasAcademicContext && academic.isDestinationMatched ? {
      eventStartTime: academic.eventStartTime,
      eventType: 'class'
    } : null,
    earlierDepartureAdvice: departureAdvice.adviceType === 'EARLIER_DEPARTURE_RECOMMENDED' ? {
      isRecommended: true,
      earlierByMinutes: departureAdvice.suggestedDeparture?.earlierByMinutes || 0,
      recommendedDepartureTime: departureAdvice.suggestedDeparture?.recommendedDepartureTime || null
    } : { isRecommended: false },
    uncertainty: {
      missingCost: cost === null,
      uncertaintyLevel: deterministicExplanation?.uncertaintyAndMissingInfo?.level || 'LOW'
    }
  };
}

// ============================================================================
// 3. GROUNDING & INTEGRITY VALIDATOR
// ============================================================================

/**
 * Validates AI output against underlying authoritative recommendation data.
 * Rejects outputs that hallucinate travel times, claim false "fastest", fabricate fares,
 * or upgrade synthetic data to verified live status.
 *
 * @param {object} aiOutput - Raw parsed AI output
 * @param {object} payload - Privacy-safe prompt payload used as ground truth
 * @returns {{ isValid: boolean, reason: string|null }}
 */
function validateAiExplanationOutput(aiOutput, payload) {
  if (!aiOutput || typeof aiOutput !== 'object') {
    return { isValid: false, reason: 'AI output is not a valid JSON object' };
  }

  const { summary, selectionReason } = aiOutput;
  if (!summary || typeof summary !== 'string' || summary.trim().length < 5) {
    return { isValid: false, reason: 'AI output missing valid summary text' };
  }
  if (!selectionReason || typeof selectionReason !== 'string' || selectionReason.trim().length < 5) {
    return { isValid: false, reason: 'AI output missing valid selectionReason text' };
  }

  const combinedText = `${summary} ${selectionReason}`.toLowerCase();
  const primary = payload.primaryRoute;

  // 1. Invariant: Duration Contradiction Check
  // If AI mentions travel time for primary route, it must match ground truth within 2 mins
  const durationMatch = combinedText.match(/\b(\d+)\s*(?:mins?|minutes)\b/);
  if (durationMatch) {
    const mentionedDuration = parseInt(durationMatch[1], 10);
    // If mentioned duration is wildly different from primary duration (and doesn't match delay, walking, or an alt)
    const isPrimaryDuration = Math.abs(mentionedDuration - primary.totalTravelTimeMinutes) <= 2;
    const isWalkingDuration = Math.abs(mentionedDuration - primary.walkingTimeMinutes) <= 2;
    const isDelayDuration = Math.abs(mentionedDuration - primary.disruptionDelayMinutes) <= 2;
    const isAltDuration = payload.alternativesSummary.some(a => Math.abs(mentionedDuration - a.totalTravelTimeMinutes) <= 2);

    if (!isPrimaryDuration && !isWalkingDuration && !isDelayDuration && !isAltDuration && Math.abs(mentionedDuration - primary.totalTravelTimeMinutes) > 5) {
      return {
        isValid: false,
        reason: `AI hallucinated duration of ${mentionedDuration} mins (actual primary duration is ${primary.totalTravelTimeMinutes} mins)`
      };
    }
  }

  // 2. Invariant: Never claim route is fastest if candidate data does not support it
  if (primary.isFastest === false) {
    if (combinedText.includes('fastest route') || combinedText.includes('shortest overall commute') || combinedText.includes('fastest travel time')) {
      return {
        isValid: false,
        reason: 'AI falsely claimed route is fastest when evaluated candidate data does not support that conclusion'
      };
    }
  }

  // 3. Invariant: Never fabricate exact fare when fare is unavailable
  if (primary.estimatedCostRupees === null) {
    if (combinedText.includes('exact fare of') || combinedText.includes('costs exactly ₹')) {
      return {
        isValid: false,
        reason: 'AI fabricated exact fare when transit cost data is unmetered or unavailable'
      };
    }
  }

  // 4. Invariant: Never claim synthetic data is officially verified live GPS
  if (primary.isSynthetic === true) {
    if (combinedText.includes('officially verified live') || combinedText.includes('real-time gps feed')) {
      return {
        isValid: false,
        reason: 'AI falsely upgraded synthetic test data to verified live status'
      };
    }
  }

  // 5. Invariant: Transfer accuracy
  if (primary.transfers > 0) {
    if (combinedText.includes('0 transfers') || combinedText.includes('non-stop journey') || combinedText.includes('zero transfers')) {
      return {
        isValid: false,
        reason: `AI falsely claimed 0 transfers when route requires ${primary.transfers} transfer(s)`
      };
    }
  }

  // 6. Security Invariant: Leak prevention
  if (combinedText.includes('api_key') || combinedText.includes('bearer ') || combinedText.includes('password')) {
    return {
      isValid: false,
      reason: 'AI output contains prohibited credential tokens'
    };
  }

  return { isValid: true, reason: null };
}

// ============================================================================
// 4. SAFE COMMUTE EXPLANATION ADAPTER
// ============================================================================

class SafeCommuteExplanationAdapter {
  /**
   * @param {object} [options={}]
   * @param {AiCommuteExplanationProvider} [options.provider] - Pluggable provider
   * @param {number} [options.timeoutMs=4000] - Bounded timeout
   */
  constructor(options = {}) {
    this.provider = options.provider || this._createDefaultProvider();
    this.timeoutMs = options.timeoutMs || 4000;
  }

  /**
   * Instantiates default provider based on environment configuration.
   * @private
   */
  _createDefaultProvider() {
    if (config.geminiApiKey && config.geminiApiKey.trim().length > 0) {
      return new GeminiCommuteExplanationProvider({
        apiKey: config.geminiApiKey,
        timeoutMs: this.timeoutMs
      });
    }
    return new DeterministicCommuteExplanationProvider();
  }

  /**
   * Enhances a deterministic recommendation explanation using the AI adapter.
   * If AI is unconfigured, times out, throws, or outputs invalid/ungrounded claims,
   * falls back safely and transparently to the deterministic explanation.
   *
   * @param {object} params
   * @param {object} params.recommendation - Authoritative recommendation context
   * @param {PersonalizedRecommendationExplanation} params.deterministicExplanation - Ground-truth deterministic explanation
   * @param {object} [params.options={}] - Execution overrides
   * @returns {Promise<PersonalizedRecommendationExplanation>}
   */
  async enhanceExplanation(params = {}) {
    const {
      recommendation,
      deterministicExplanation,
      options = {}
    } = params;

    if (!deterministicExplanation) {
      return deterministicExplanation;
    }

    // 1. Explicit disable check
    if (options.useAiExplanation === false) {
      return this._withAiMetadata(deterministicExplanation, {
        isAiEnhanced: false,
        provider: 'Deterministic Grounded Engine',
        fallbackReason: AI_FALLBACK_REASONS.DISABLED
      });
    }

    // 2. Credentials availability check
    if (!this.provider.isConfigured()) {
      return this._withAiMetadata(deterministicExplanation, {
        isAiEnhanced: false,
        provider: 'Deterministic Grounded Engine',
        fallbackReason: AI_FALLBACK_REASONS.MISSING_CREDENTIALS
      });
    }

    // 3. Build strictly sanitized, minimal prompt payload
    const payload = buildPrivacySafePromptPayload(recommendation, deterministicExplanation);
    const timeout = options.timeoutMs || this.timeoutMs || 4000;

    try {
      // 4. Bounded execution with timeout race
      const timeoutPromise = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`AI provider request timed out after ${timeout}ms`));
        }, timeout);
        if (typeof timer.unref === 'function') timer.unref();
      });

      const aiResponse = await Promise.race([
        this.provider.generateExplanation(payload, { timeoutMs: timeout, ...options }),
        timeoutPromise
      ]);

      // 5. Strict Grounding Validation
      const validation = validateAiExplanationOutput(aiResponse, payload);
      if (!validation.isValid) {
        console.warn(`[SafeCommuteExplanationAdapter] AI output rejected: ${validation.reason}. Falling back to deterministic explanation.`);
        return this._withAiMetadata(deterministicExplanation, {
          isAiEnhanced: false,
          provider: this.provider.name,
          fallbackReason: AI_FALLBACK_REASONS.VALIDATION_FAILED,
          validationPassed: false
        });
      }

      // 6. Valid AI Output: Blend polished natural language into explanation
      return this._blendAiExplanation(deterministicExplanation, aiResponse);
    } catch (err) {
      const isTimeout = err.message && err.message.includes('timed out');
      const fallbackReason = isTimeout ? AI_FALLBACK_REASONS.TIMEOUT : AI_FALLBACK_REASONS.PROVIDER_ERROR;

      console.warn(`[SafeCommuteExplanationAdapter] ${fallbackReason}: ${err.message}. Safely returning deterministic explanation.`);

      return this._withAiMetadata(deterministicExplanation, {
        isAiEnhanced: false,
        provider: this.provider.name,
        fallbackReason,
        validationPassed: true
      });
    }
  }

  /**
   * Blends valid AI natural language phrasing while strictly preserving all underlying numbers,
   * buffers, trade-offs, provenance, and schedule metadata.
   *
   * @private
   */
  _blendAiExplanation(deterministicExpl, aiResponse) {
    const raw = deterministicExpl.toJSON();

    return new PersonalizedRecommendationExplanation({
      ...raw,
      summary: aiResponse.summary.trim(),
      selectionReason: aiResponse.selectionReason.trim(),
      aiMetadata: {
        isAiEnhanced: true,
        provider: this.provider.name,
        model: this.provider.model,
        confidence: 'high',
        fallbackReason: null,
        validationPassed: true
      }
    });
  }

  /**
   * Attaches AI metadata to a deterministic explanation.
   *
   * @private
   */
  _withAiMetadata(deterministicExpl, meta = {}) {
    const raw = deterministicExpl.toJSON();
    return new PersonalizedRecommendationExplanation({
      ...raw,
      aiMetadata: {
        isAiEnhanced: Boolean(meta.isAiEnhanced),
        provider: meta.provider || 'Deterministic Grounded Engine',
        model: this.provider?.model || null,
        confidence: 'high',
        fallbackReason: meta.fallbackReason || null,
        validationPassed: meta.validationPassed !== false
      }
    });
  }
}

const safeCommuteExplanationAdapter = new SafeCommuteExplanationAdapter();

module.exports = {
  SafeCommuteExplanationAdapter,
  safeCommuteExplanationAdapter,
  AiCommuteExplanationProvider,
  GeminiCommuteExplanationProvider,
  DeterministicCommuteExplanationProvider,
  MockAiCommuteExplanationProvider,
  buildPrivacySafePromptPayload,
  validateAiExplanationOutput,
  sanitizeCoarseArea,
  AI_FALLBACK_REASONS
};
