/**
 * PersonalizedRecommendationExplanation Domain Model
 *
 * Establishes structured, grounded explanation contracts for personalized commute recommendations.
 *
 * Guaranteed Properties:
 * - Deterministic: Zero hallucinations or speculative claims.
 * - Metric-Grounded: Every explanation string directly reflects verified route metrics.
 * - Multi-tier Provenance: Explicitly distinguishes VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC facts.
 * - Uncertainty Transparency: Identifies missing cost, sensor gaps, and live data bounds honestly.
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  provenanceTierEnum
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

const satisfiedPreferenceSchema = z.object({
  preference: z.string(),
  isSatisfied: z.boolean(),
  detail: z.string(),
  priority: z.coerce.number().int().default(1)
});

const timingExplanationSchema = z.object({
  travelTimeMinutes: z.coerce.number().min(0),
  departureTime: z.string().nullable().default(null),
  estimatedArrivalTime: z.string().nullable().default(null),
  targetArrivalTime: z.string().nullable().default(null),
  marginMinutes: z.coerce.number().nullable().default(null),
  narrative: z.string(),
  isPunctual: z.boolean().default(true),
  dataTier: provenanceTierEnum.default(PROVENANCE_TIERS.ESTIMATED)
});

const disruptionExplanationSchema = z.object({
  hasDisruptions: z.boolean().default(false),
  delayMinutes: z.coerce.number().min(0).default(0),
  affectedSegments: z.array(z.any()).default([]),
  advisories: z.array(z.string()).default([]),
  narrative: z.string(),
  dataTier: provenanceTierEnum.default(PROVENANCE_TIERS.VERIFIED)
});

const alternativeExplanationSchema = z.object({
  alternativeJourneyId: z.string(),
  primaryMode: z.string().default('transit'),
  preferableWhen: z.string(),
  tradeOffNarrative: z.string(),
  metricsSummary: z.object({
    travelTimeMinutes: z.coerce.number().min(0).nullable().default(null),
    costRupees: z.coerce.number().min(0).nullable().default(null),
    transfers: z.coerce.number().min(0).default(0),
    walkingMinutes: z.coerce.number().min(0).default(0)
  }).default({})
});

const uncertaintyExplanationSchema = z.object({
  level: z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']).default('LOW'),
  missingFields: z.array(z.string()).default([]),
  uncertainFactors: z.array(z.string()).default([]),
  narrative: z.string(),
  dataTiers: z.array(z.string()).default(['ESTIMATED'])
});

const provenanceBreakdownSchema = z.object({
  verifiedFacts: z.array(z.string()).default([]),
  userReportedFacts: z.array(z.string()).default([]),
  estimatedFacts: z.array(z.string()).default([]),
  syntheticFacts: z.array(z.string()).default([]),
  overallTier: provenanceTierEnum.default(PROVENANCE_TIERS.ESTIMATED)
});

const personalizedRecommendationExplanationSchema = z.object({
  recommendationId: z.string().min(1, 'Recommendation ID is required'),
  primaryRouteId: z.string().min(1, 'Primary route ID is required'),
  summary: z.string().min(1, 'Explanation summary is required'),
  selectionReason: z.string().min(1, 'Selection reason is required'),
  satisfiedPreferences: z.array(satisfiedPreferenceSchema).default([]),
  timingExplanation: timingExplanationSchema,
  disruptionEffects: disruptionExplanationSchema,
  tradeOffs: z.array(z.string()).default([]),
  uncertaintyAndMissingInfo: uncertaintyExplanationSchema,
  alternativeExplanations: z.array(alternativeExplanationSchema).default([]),
  provenanceBreakdown: provenanceBreakdownSchema.default(() => ({})),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Explanation Engine').toJSON()),
  generatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class PersonalizedRecommendationExplanation {
  constructor(data) {
    try {
      const validated = personalizedRecommendationExplanationSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid recommendation explanation: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  toJSON() {
    return {
      recommendationId: this.recommendationId,
      primaryRouteId: this.primaryRouteId,
      summary: this.summary,
      selectionReason: this.selectionReason,
      satisfiedPreferences: this.satisfiedPreferences.map(p => ({ ...p })),
      timingExplanation: { ...this.timingExplanation },
      disruptionEffects: {
        ...this.disruptionEffects,
        affectedSegments: this.disruptionEffects.affectedSegments.map(s => ({ ...s })),
        advisories: [...this.disruptionEffects.advisories]
      },
      tradeOffs: [...this.tradeOffs],
      uncertaintyAndMissingInfo: {
        ...this.uncertaintyAndMissingInfo,
        missingFields: [...this.uncertaintyAndMissingInfo.missingFields],
        uncertainFactors: [...this.uncertaintyAndMissingInfo.uncertainFactors],
        dataTiers: [...this.uncertaintyAndMissingInfo.dataTiers]
      },
      alternativeExplanations: this.alternativeExplanations.map(a => ({
        ...a,
        metricsSummary: { ...a.metricsSummary }
      })),
      provenanceBreakdown: {
        verifiedFacts: [...(this.provenanceBreakdown.verifiedFacts || [])],
        userReportedFacts: [...(this.provenanceBreakdown.userReportedFacts || [])],
        estimatedFacts: [...(this.provenanceBreakdown.estimatedFacts || [])],
        syntheticFacts: [...(this.provenanceBreakdown.syntheticFacts || [])],
        overallTier: this.provenanceBreakdown.overallTier || PROVENANCE_TIERS.ESTIMATED
      },
      provenance: this.provenance.toJSON(),
      generatedAt: this.generatedAt
    };
  }
}

module.exports = {
  PersonalizedRecommendationExplanation,
  personalizedRecommendationExplanationSchema,
  satisfiedPreferenceSchema,
  timingExplanationSchema,
  disruptionExplanationSchema,
  alternativeExplanationSchema,
  uncertaintyExplanationSchema,
  provenanceBreakdownSchema
};
