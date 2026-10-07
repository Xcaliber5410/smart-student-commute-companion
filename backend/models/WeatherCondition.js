/**
 * WeatherCondition Domain Model & Commute Weather Context Contracts
 *
 * Formal domain models representing environmental weather conditions,
 * commute-specific weather impacts, walking inconvenience, road delays,
 * and travel uncertainty with 4-tier data provenance.
 *
 * Supported Weather Conditions:
 * - clear: Fair skies / normal commute weather
 * - rain: Light to moderate precipitation
 * - heavy_rain: Heavy monsoon downpour / localized waterlogging
 * - severe: Severe thunderstorm / cyclonic storm conditions
 * - extreme_heat: Scorching midday temperatures / high heat index
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

/**
 * Standard weather condition keys.
 */
const WEATHER_CONDITIONS = Object.freeze({
  CLEAR: 'clear',
  RAIN: 'rain',
  HEAVY_RAIN: 'heavy_rain',
  SEVERE: 'severe',
  EXTREME_HEAT: 'extreme_heat'
});

const weatherConditionEnum = z.enum([
  'clear',
  'rain',
  'heavy_rain',
  'severe',
  'extreme_heat'
]);

/**
 * Normalizes loose or provider-specific weather condition strings into standard keys.
 *
 * @param {string} rawCondition
 * @returns {string} Standard WEATHER_CONDITIONS key
 */
function normalizeWeatherCondition(rawCondition) {
  if (!rawCondition || typeof rawCondition !== 'string') {
    return WEATHER_CONDITIONS.CLEAR;
  }
  const clean = rawCondition.trim().toLowerCase();

  if (['clear', 'normal', 'sunny', 'partly cloudy', 'cloudy', 'humid / hazy', 'humid & partly cloudy', 'clear sky', 'mainly clear / partly cloudy', 'overcast'].includes(clean)) {
    return WEATHER_CONDITIONS.CLEAR;
  }
  if (['rain', 'light rain', 'drizzle', 'light rain / drizzle', 'showers', 'rainy'].includes(clean)) {
    return WEATHER_CONDITIONS.RAIN;
  }
  if (['heavy_rain', 'heavy rain', 'moderate to heavy rain', 'downpour', 'monsoon', 'torrential'].includes(clean)) {
    return WEATHER_CONDITIONS.HEAVY_RAIN;
  }
  if (['severe', 'storm', 'thunderstorm', 'heavy thunderstorm & downpour', 'cyclone', 'squall', 'gale'].includes(clean)) {
    return WEATHER_CONDITIONS.SEVERE;
  }
  if (['extreme_heat', 'extreme heat', 'heatwave', 'heat wave', 'hot', 'scorching'].includes(clean)) {
    return WEATHER_CONDITIONS.EXTREME_HEAT;
  }

  return WEATHER_CONDITIONS.CLEAR;
}

/**
 * Walking inconvenience levels.
 */
const WALKING_INCONVENIENCE_LEVELS = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME'
});

const walkingInconvenienceEnum = z.enum(['NONE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME']);

/**
 * Travel uncertainty ratings.
 */
const TRAVEL_UNCERTAINTY_LEVELS = Object.freeze({
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE'
});

const travelUncertaintyEnum = z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']);

/**
 * Outdoor exposure risk categories.
 */
const OUTDOOR_EXPOSURE_RISKS = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  DANGEROUS: 'DANGEROUS'
});

const outdoorExposureRiskEnum = z.enum(['NONE', 'LOW', 'MODERATE', 'HIGH', 'DANGEROUS']);

/**
 * Baseline parameters per weather condition for commute evaluation.
 */
const WEATHER_SEVERITY_FACTORS = Object.freeze({
  [WEATHER_CONDITIONS.CLEAR]: {
    label: 'Clear / Normal',
    walkingInconvenienceLevel: WALKING_INCONVENIENCE_LEVELS.NONE,
    walkingFatigueFactor: 0.0,
    roadDelayMinutesPerSegment: 0,
    travelUncertaintyLevel: TRAVEL_UNCERTAINTY_LEVELS.LOW,
    uncertaintyVarianceMinutes: 2,
    recommendEarlyDepartureMinutes: 0,
    outdoorExposureRisk: OUTDOOR_EXPOSURE_RISKS.NONE,
    advisory: 'Clear commute conditions; normal travel times expected.'
  },
  [WEATHER_CONDITIONS.RAIN]: {
    label: 'Rain / Moderate Showers',
    walkingInconvenienceLevel: WALKING_INCONVENIENCE_LEVELS.MODERATE,
    walkingFatigueFactor: 0.15,
    roadDelayMinutesPerSegment: 4,
    travelUncertaintyLevel: TRAVEL_UNCERTAINTY_LEVELS.MODERATE,
    uncertaintyVarianceMinutes: 6,
    recommendEarlyDepartureMinutes: 5,
    outdoorExposureRisk: OUTDOOR_EXPOSURE_RISKS.MODERATE,
    advisory: 'Wet surfaces and reduced road speeds. Carry an umbrella and plan 5 min extra buffer.'
  },
  [WEATHER_CONDITIONS.HEAVY_RAIN]: {
    label: 'Heavy Monsoon Rain',
    walkingInconvenienceLevel: WALKING_INCONVENIENCE_LEVELS.HIGH,
    walkingFatigueFactor: 0.35,
    roadDelayMinutesPerSegment: 10,
    travelUncertaintyLevel: TRAVEL_UNCERTAINTY_LEVELS.HIGH,
    uncertaintyVarianceMinutes: 15,
    recommendEarlyDepartureMinutes: 15,
    outdoorExposureRisk: OUTDOOR_EXPOSURE_RISKS.HIGH,
    advisory: 'Torrential downpour with localized street waterlogging. Walking is impeded; surface roads congested.'
  },
  [WEATHER_CONDITIONS.SEVERE]: {
    label: 'Severe Storm / Downpour',
    walkingInconvenienceLevel: WALKING_INCONVENIENCE_LEVELS.EXTREME,
    walkingFatigueFactor: 0.50,
    roadDelayMinutesPerSegment: 18,
    travelUncertaintyLevel: TRAVEL_UNCERTAINTY_LEVELS.SEVERE,
    uncertaintyVarianceMinutes: 25,
    recommendEarlyDepartureMinutes: 30,
    outdoorExposureRisk: OUTDOOR_EXPOSURE_RISKS.DANGEROUS,
    advisory: 'Severe cyclonic squall with high winds and heavy flooding. Major transit delays across surface transport.'
  },
  [WEATHER_CONDITIONS.EXTREME_HEAT]: {
    label: 'Extreme Heat',
    walkingInconvenienceLevel: WALKING_INCONVENIENCE_LEVELS.HIGH,
    walkingFatigueFactor: 0.25,
    roadDelayMinutesPerSegment: 0,
    travelUncertaintyLevel: TRAVEL_UNCERTAINTY_LEVELS.LOW,
    uncertaintyVarianceMinutes: 4,
    recommendEarlyDepartureMinutes: 5,
    outdoorExposureRisk: OUTDOOR_EXPOSURE_RISKS.HIGH,
    advisory: 'Severe heat index. Walking under direct sun is physically taxing; seek air-conditioned transit where possible.'
  }
});

/**
 * Zod schema for WeatherCondition.
 */
const weatherConditionSchema = z.object({
  id: z.string().min(1, 'Weather condition ID is required'),
  condition: weatherConditionEnum.default(WEATHER_CONDITIONS.CLEAR),
  temperatureC: z.coerce.number().default(28),
  feelsLikeC: z.coerce.number().default(30),
  humidity: z.coerce.number().min(0).max(100).default(75),
  precipitationProbability: z.coerce.number().min(0).max(100).default(0),
  precipitationMm: z.coerce.number().min(0).default(0),
  windSpeedKmh: z.coerce.number().min(0).default(15),
  description: z.string().max(300).default(''),
  area: z.string().max(100).default('Mumbai Metropolitan Region'),
  startTime: z.coerce.number().int().positive().default(() => Date.now()),
  expiryTime: z.coerce.number().int().positive().default(() => Date.now() + 60 * 60 * 1000),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Weather Model').toJSON()),
  createdAt: z.coerce.number().int().positive().default(() => Date.now())
});

/**
 * Domain entity representing an observed or forecasted weather condition.
 */
class WeatherCondition {
  constructor(data) {
    try {
      const validated = weatherConditionSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid weather condition: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method creating a normalized WeatherCondition.
   * @param {object} input
   * @returns {WeatherCondition}
   */
  static create(input = {}) {
    const now = Date.now();
    const condition = normalizeWeatherCondition(input.condition);
    const durationMs = (input.durationMinutes || 60) * 60 * 1000;
    const startTime = input.startTime !== undefined ? Number(input.startTime) : now;
    const expiryTime = input.expiryTime !== undefined ? Number(input.expiryTime) : (startTime + durationMs);
    const id = input.id || `wx-${now}-${Math.random().toString(36).substring(2, 7)}`;

    return new WeatherCondition({
      ...input,
      id,
      condition,
      startTime,
      expiryTime,
      createdAt: input.createdAt || now
    });
  }

  /**
   * Checks whether this condition is currently active.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isActive(currentTime = Date.now()) {
    return this.startTime <= currentTime && currentTime <= this.expiryTime;
  }

  /**
   * Checks whether this condition has expired.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return currentTime > this.expiryTime;
  }

  /**
   * Serializes to plain JSON object.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      condition: this.condition,
      temperatureC: this.temperatureC,
      feelsLikeC: this.feelsLikeC,
      humidity: this.humidity,
      precipitationProbability: this.precipitationProbability,
      precipitationMm: this.precipitationMm,
      windSpeedKmh: this.windSpeedKmh,
      description: this.description,
      area: this.area,
      startTime: this.startTime,
      expiryTime: this.expiryTime,
      confidence: this.confidence,
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      createdAt: this.createdAt
    };
  }
}

/**
 * Zod schema for WeatherContext.
 */
const weatherContextSchema = z.object({
  condition: weatherConditionEnum.default(WEATHER_CONDITIONS.CLEAR),
  label: z.string().default('Clear / Normal'),
  temperatureC: z.coerce.number().default(28),
  feelsLikeC: z.coerce.number().default(30),
  humidity: z.coerce.number().min(0).max(100).default(75),
  precipitationProbability: z.coerce.number().min(0).max(100).default(0),
  advisory: z.string().default('Normal commute conditions'),
  walkingInconvenienceLevel: walkingInconvenienceEnum.default(WALKING_INCONVENIENCE_LEVELS.NONE),
  roadDelayMinutes: z.coerce.number().min(0).default(0),
  travelUncertaintyLevel: travelUncertaintyEnum.default(TRAVEL_UNCERTAINTY_LEVELS.LOW),
  outdoorExposureRisk: outdoorExposureRiskEnum.default(OUTDOOR_EXPOSURE_RISKS.NONE),
  recommendEarlyDepartureMinutes: z.coerce.number().min(0).default(0),
  conditions: z.array(z.any()).default([]),
  startTime: z.coerce.number().int().positive().default(() => Date.now()),
  expiryTime: z.coerce.number().int().positive().default(() => Date.now() + 60 * 60 * 1000),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Weather Context Engine').toJSON()),
  evaluatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

/**
 * Normalized commute-relevant weather context envelope.
 */
class WeatherContext {
  constructor(data = {}) {
    const validated = weatherContextSchema.parse(data);
    Object.assign(this, validated);
    this.conditions = (validated.conditions || []).map(c => (c instanceof WeatherCondition ? c : new WeatherCondition(c)));
    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  /**
   * Checks whether this weather context has expired.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return currentTime > this.expiryTime;
  }

  /**
   * Factory: Clear / normal weather context.
   */
  static clear(options = {}) {
    const factors = WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.CLEAR];
    const now = options.evaluatedAt || Date.now();
    return new WeatherContext({
      condition: WEATHER_CONDITIONS.CLEAR,
      label: factors.label,
      temperatureC: options.temperatureC || 28,
      feelsLikeC: options.feelsLikeC || 30,
      humidity: options.humidity || 70,
      precipitationProbability: options.precipitationProbability || 0,
      advisory: factors.advisory,
      walkingInconvenienceLevel: factors.walkingInconvenienceLevel,
      roadDelayMinutes: factors.roadDelayMinutesPerSegment,
      travelUncertaintyLevel: factors.travelUncertaintyLevel,
      outdoorExposureRisk: factors.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes,
      conditions: options.conditions || [],
      startTime: options.startTime || now,
      expiryTime: options.expiryTime || (now + 60 * 60 * 1000),
      provenance: options.provenance || DataProvenance.verified('Weather Context Engine', 'Clear atmospheric conditions observed').toJSON(),
      evaluatedAt: now
    });
  }

  /**
   * Factory: Rain weather context.
   */
  static rain(options = {}) {
    const factors = WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.RAIN];
    const now = options.evaluatedAt || Date.now();
    return new WeatherContext({
      condition: WEATHER_CONDITIONS.RAIN,
      label: factors.label,
      temperatureC: options.temperatureC || 27,
      feelsLikeC: options.feelsLikeC || 30,
      humidity: options.humidity || 85,
      precipitationProbability: options.precipitationProbability || 70,
      advisory: options.advisory || factors.advisory,
      walkingInconvenienceLevel: factors.walkingInconvenienceLevel,
      roadDelayMinutes: factors.roadDelayMinutesPerSegment,
      travelUncertaintyLevel: factors.travelUncertaintyLevel,
      outdoorExposureRisk: factors.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes,
      conditions: options.conditions || [],
      startTime: options.startTime || now,
      expiryTime: options.expiryTime || (now + 60 * 60 * 1000),
      provenance: options.provenance || DataProvenance.verified('IMD Regional Radar', 'Monsoon rain showers active').toJSON(),
      evaluatedAt: now
    });
  }

  /**
   * Factory: Heavy rain weather context.
   */
  static heavyRain(options = {}) {
    const factors = WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.HEAVY_RAIN];
    const now = options.evaluatedAt || Date.now();
    return new WeatherContext({
      condition: WEATHER_CONDITIONS.HEAVY_RAIN,
      label: factors.label,
      temperatureC: options.temperatureC || 25,
      feelsLikeC: options.feelsLikeC || 28,
      humidity: options.humidity || 95,
      precipitationProbability: options.precipitationProbability || 95,
      advisory: options.advisory || factors.advisory,
      walkingInconvenienceLevel: factors.walkingInconvenienceLevel,
      roadDelayMinutes: factors.roadDelayMinutesPerSegment,
      travelUncertaintyLevel: factors.travelUncertaintyLevel,
      outdoorExposureRisk: factors.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes,
      conditions: options.conditions || [],
      startTime: options.startTime || now,
      expiryTime: options.expiryTime || (now + 60 * 60 * 1000),
      provenance: options.provenance || DataProvenance.verified('IMD Mumbai Bulletin', 'Heavy monsoon downpour warning issued').toJSON(),
      evaluatedAt: now
    });
  }

  /**
   * Factory: Severe storm weather context.
   */
  static severe(options = {}) {
    const factors = WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.SEVERE];
    const now = options.evaluatedAt || Date.now();
    return new WeatherContext({
      condition: WEATHER_CONDITIONS.SEVERE,
      label: factors.label,
      temperatureC: options.temperatureC || 24,
      feelsLikeC: options.feelsLikeC || 26,
      humidity: options.humidity || 98,
      precipitationProbability: options.precipitationProbability || 99,
      advisory: options.advisory || factors.advisory,
      walkingInconvenienceLevel: factors.walkingInconvenienceLevel,
      roadDelayMinutes: factors.roadDelayMinutesPerSegment,
      travelUncertaintyLevel: factors.travelUncertaintyLevel,
      outdoorExposureRisk: factors.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes,
      conditions: options.conditions || [],
      startTime: options.startTime || now,
      expiryTime: options.expiryTime || (now + 60 * 60 * 1000),
      provenance: options.provenance || DataProvenance.verified('Disaster Management Cell', 'Severe cyclonic squall alert').toJSON(),
      evaluatedAt: now
    });
  }

  /**
   * Factory: Extreme heat weather context.
   */
  static extremeHeat(options = {}) {
    const factors = WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.EXTREME_HEAT];
    const now = options.evaluatedAt || Date.now();
    return new WeatherContext({
      condition: WEATHER_CONDITIONS.EXTREME_HEAT,
      label: factors.label,
      temperatureC: options.temperatureC || 41,
      feelsLikeC: options.feelsLikeC || 47,
      humidity: options.humidity || 65,
      precipitationProbability: 0,
      advisory: options.advisory || factors.advisory,
      walkingInconvenienceLevel: factors.walkingInconvenienceLevel,
      roadDelayMinutes: factors.roadDelayMinutesPerSegment,
      travelUncertaintyLevel: factors.travelUncertaintyLevel,
      outdoorExposureRisk: factors.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes,
      conditions: options.conditions || [],
      startTime: options.startTime || now,
      expiryTime: options.expiryTime || (now + 60 * 60 * 1000),
      provenance: options.provenance || DataProvenance.verified('IMD Heat Alert', 'Severe heatwave warning').toJSON(),
      evaluatedAt: now
    });
  }

  toJSON() {
    return {
      condition: this.condition,
      label: this.label,
      temperatureC: this.temperatureC,
      feelsLikeC: this.feelsLikeC,
      humidity: this.humidity,
      precipitationProbability: this.precipitationProbability,
      rainProbability: this.precipitationProbability,
      advisory: this.advisory,
      walkingInconvenienceLevel: this.walkingInconvenienceLevel,
      roadDelayMinutes: this.roadDelayMinutes,
      travelUncertaintyLevel: this.travelUncertaintyLevel,
      outdoorExposureRisk: this.outdoorExposureRisk,
      recommendEarlyDepartureMinutes: this.recommendEarlyDepartureMinutes,
      conditions: this.conditions.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c)),
      startTime: this.startTime,
      expiryTime: this.expiryTime,
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

/**
 * Value object encapsulating the deterministic impact of weather conditions on a candidate journey.
 */
class JourneyWeatherImpact {
  constructor(data = {}) {
    this.journeyId = data.journeyId || null;
    this.weatherCondition = data.weatherCondition || WEATHER_CONDITIONS.CLEAR;
    this.isAffected = Boolean(data.isAffected);

    this.walkingInconvenience = {
      level: data.walkingInconvenience?.level || WALKING_INCONVENIENCE_LEVELS.NONE,
      score: Number(data.walkingInconvenience?.score || 0),
      outdoorWalkMinutes: Number(data.walkingInconvenience?.outdoorWalkMinutes || 0),
      addedWalkFatigueMinutes: Number(data.walkingInconvenience?.addedWalkFatigueMinutes || 0),
      advisory: data.walkingInconvenience?.advisory || ''
    };

    this.roadDelay = {
      estimatedDelayMinutes: Number(data.roadDelay?.estimatedDelayMinutes || 0),
      affectedRoadSegmentsCount: Number(data.roadDelay?.affectedRoadSegmentsCount || 0),
      affectedRoadSegmentIndices: Array.isArray(data.roadDelay?.affectedRoadSegmentIndices)
        ? [...data.roadDelay.affectedRoadSegmentIndices]
        : []
    };

    this.travelUncertainty = {
      level: data.travelUncertainty?.level || TRAVEL_UNCERTAINTY_LEVELS.LOW,
      varianceMinutes: Number(data.travelUncertainty?.varianceMinutes || 0),
      recommendEarlyDepartureMinutes: Number(data.travelUncertainty?.recommendEarlyDepartureMinutes || 0)
    };

    this.affectedOutdoorSegments = Array.isArray(data.affectedOutdoorSegments)
      ? [...data.affectedOutdoorSegments]
      : [];
    this.shelteredSegments = Array.isArray(data.shelteredSegments)
      ? [...data.shelteredSegments]
      : [];

    this.totalAddedTravelTimeMinutes = Number(data.totalAddedTravelTimeMinutes || 0);
    this.originalDurationMinutes = Number(data.originalDurationMinutes || 0);
    this.updatedDurationMinutes = Number(data.updatedDurationMinutes || (this.originalDurationMinutes + this.totalAddedTravelTimeMinutes));
    this.isImpractical = Boolean(data.isImpractical);
    this.impracticalReason = data.impracticalReason || null;

    this.advisories = Array.isArray(data.advisories) ? [...data.advisories] : [];
    this.dataTiers = Array.isArray(data.dataTiers) ? [...data.dataTiers] : [];

    this.provenance = data.provenance instanceof DataProvenance
      ? data.provenance
      : new DataProvenance(data.provenance || DataProvenance.estimated('Weather Impact Engine').toJSON());
    this.evaluatedAt = data.evaluatedAt || Date.now();
  }

  isUnaffected() {
    return !this.isAffected;
  }

  hasOutdoorExposure() {
    return this.affectedOutdoorSegments.length > 0;
  }

  hasRoadDelay() {
    return this.roadDelay.estimatedDelayMinutes > 0;
  }

  hasTravelUncertainty() {
    return this.travelUncertainty.varianceMinutes > 0;
  }

  hasVerifiedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.VERIFIED);
  }

  hasUserReportedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED);
  }

  hasEstimatedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.ESTIMATED);
  }

  hasSyntheticData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC);
  }

  toJSON() {
    return {
      journeyId: this.journeyId,
      weatherCondition: this.weatherCondition,
      isAffected: this.isAffected,
      walkingInconvenience: { ...this.walkingInconvenience },
      roadDelay: {
        estimatedDelayMinutes: this.roadDelay.estimatedDelayMinutes,
        affectedRoadSegmentsCount: this.roadDelay.affectedRoadSegmentsCount,
        affectedRoadSegmentIndices: [...this.roadDelay.affectedRoadSegmentIndices]
      },
      travelUncertainty: { ...this.travelUncertainty },
      affectedOutdoorSegments: [...this.affectedOutdoorSegments],
      shelteredSegments: [...this.shelteredSegments],
      totalAddedTravelTimeMinutes: this.totalAddedTravelTimeMinutes,
      originalDurationMinutes: this.originalDurationMinutes,
      updatedDurationMinutes: this.updatedDurationMinutes,
      isImpractical: this.isImpractical,
      impracticalReason: this.impracticalReason,
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  WEATHER_CONDITIONS,
  weatherConditionEnum,
  normalizeWeatherCondition,
  WALKING_INCONVENIENCE_LEVELS,
  walkingInconvenienceEnum,
  TRAVEL_UNCERTAINTY_LEVELS,
  travelUncertaintyEnum,
  OUTDOOR_EXPOSURE_RISKS,
  outdoorExposureRiskEnum,
  WEATHER_SEVERITY_FACTORS,
  weatherConditionSchema,
  WeatherCondition,
  weatherContextSchema,
  WeatherContext,
  JourneyWeatherImpact
};
