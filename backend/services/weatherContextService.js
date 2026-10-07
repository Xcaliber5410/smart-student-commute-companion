/**
 * WeatherContextService
 *
 * Provides normalized, commute-relevant environmental context and evaluates
 * deterministic impacts on candidate student journeys.
 *
 * Commute-Specific Impacts:
 * - Walking Inconvenience: Quantifies pedestrian discomfort, fatigue, and impedance
 *   across exposed outdoor walking segments during rain, downpours, or extreme heat.
 * - Road Delay: Estimates vehicular surface slowdowns for autos, shared autos, and buses
 *   due to wet pavements, waterlogged roads, or heavy congestion.
 * - Travel Uncertainty: Quantifies travel variance and recommends early departure buffers.
 * - Outdoor Exposure: Distinguishes exposed surface legs (walk, open auto) from
 *   sheltered fixed-guideway transit (metro, suburban rail).
 * - Provenance: Preserves 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 *
 * Guarantees:
 * - Mild/moderate weather never declares a route impossible.
 * - Deterministic and explainable impact calculations.
 */

const {
  WEATHER_CONDITIONS,
  normalizeWeatherCondition,
  WALKING_INCONVENIENCE_LEVELS,
  TRAVEL_UNCERTAINTY_LEVELS,
  OUTDOOR_EXPOSURE_RISKS,
  WEATHER_SEVERITY_FACTORS,
  WeatherCondition,
  WeatherContext,
  JourneyWeatherImpact
} = require('../models/WeatherCondition');
const {
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES
} = require('../models/CommuteContracts');
const { getMumbaiWeather } = require('./weatherService');

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

/**
 * Surface road modes impacted by wet roads and localized street congestion.
 */
const ROAD_TRANSPORT_MODES = Object.freeze(['auto', 'shared_auto', 'bus']);

/**
 * Sheltered mass transit modes protected from weather and road waterlogging.
 */
const SHELTERED_TRANSPORT_MODES = Object.freeze(['metro', 'train']);

class WeatherContextService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.weatherProvider] Weather client with getMumbaiWeather()
   */
  constructor(options = {}) {
    this.weatherProvider = options.weatherProvider || { getMumbaiWeather };
  }

  /**
   * Seeds realistic prototype weather conditions across all 4 provenance tiers.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {WeatherCondition[]}
   */
  seedPrototypeWeatherConditions(currentTime = Date.now()) {
    const oneHourAhead = currentTime + 60 * 60 * 1000;
    const twoHoursAhead = currentTime + 2 * 60 * 60 * 1000;

    return [
      // 1. VERIFIED: Official IMD Monsoon Bulletin
      new WeatherCondition({
        id: 'wx-imd-mumbai-heavy-rain',
        condition: WEATHER_CONDITIONS.HEAVY_RAIN,
        temperatureC: 26,
        feelsLikeC: 29,
        humidity: 94,
        precipitationProbability: 95,
        precipitationMm: 42,
        windSpeedKmh: 35,
        description: 'IMD Santacruz Weather Station Bulletin: Active monsoon surge with heavy rain spells across Western Suburbs',
        area: 'Mumbai Western Suburbs',
        startTime: currentTime - 30 * 60 * 1000,
        expiryTime: twoHoursAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.verified(
          'India Meteorological Department (IMD) Mumbai',
          'Heavy monsoon precipitation alert with localized waterlogging'
        ).toJSON(),
        createdAt: currentTime - 30 * 60 * 1000
      }),

      // 2. USER_REPORTED: Crowdsourced Commuter Flood/Rain Observation
      new WeatherCondition({
        id: 'wx-commuter-rain-report',
        condition: WEATHER_CONDITIONS.RAIN,
        temperatureC: 27,
        feelsLikeC: 30,
        humidity: 88,
        precipitationProbability: 80,
        precipitationMm: 12,
        windSpeedKmh: 20,
        description: 'Commuter report: Moderate continuous rain causing ankle-deep water accumulation on SV Road near Vile Parle',
        area: 'Vile Parle - SV Road',
        startTime: currentTime - 15 * 60 * 1000,
        expiryTime: oneHourAhead,
        confidence: 'MEDIUM',
        provenance: DataProvenance.userReported(
          'Student Commuter Weather Feed',
          'Multiple commuters report rain and slow-moving auto-rickshaws'
        ).toJSON(),
        createdAt: currentTime - 15 * 60 * 1000
      }),

      // 3. ESTIMATED: Doppler Radar Precipitation Estimate
      new WeatherCondition({
        id: 'wx-radar-nowcast-rain',
        condition: WEATHER_CONDITIONS.RAIN,
        temperatureC: 28,
        feelsLikeC: 31,
        humidity: 82,
        precipitationProbability: 70,
        precipitationMm: 8,
        windSpeedKmh: 18,
        description: 'Doppler Radar algorithmic nowcast: Passing rain bands with 15-minute clearing windows',
        area: 'Andheri - Juhu Corridor',
        startTime: currentTime - 10 * 60 * 1000,
        expiryTime: oneHourAhead,
        confidence: 'MEDIUM',
        provenance: DataProvenance.estimated(
          'Doppler Radar Precipitation Nowcast Model'
        ).toJSON(),
        createdAt: currentTime - 10 * 60 * 1000
      }),

      // 4. SYNTHETIC: Severe Storm Simulation
      new WeatherCondition({
        id: 'wx-simulation-severe-storm',
        condition: WEATHER_CONDITIONS.SEVERE,
        temperatureC: 24,
        feelsLikeC: 26,
        humidity: 98,
        precipitationProbability: 99,
        precipitationMm: 65,
        windSpeedKmh: 68,
        description: 'Monsoon Commute Simulation Model: Severe cyclonic downpour and gale gusts',
        area: 'Greater Mumbai Coastal Region',
        startTime: currentTime,
        expiryTime: twoHoursAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.synthetic(
          'Monsoon Commute Extreme Weather Simulation Engine'
        ).toJSON(),
        createdAt: currentTime
      })
    ];
  }

  /**
   * Retrieves or builds a normalized WeatherContext.
   *
   * @param {object} [options={}]
   * @param {string} [options.condition] Optional explicit condition (e.g. 'rain', 'heavy_rain', 'extreme_heat')
   * @param {WeatherContext|object} [options.weatherContext] Pre-existing context to evaluate or normalize
   * @param {number} [options.currentTime=Date.now()] Reference timestamp for temporal validity
   * @returns {Promise<WeatherContext>} Normalized WeatherContext
   */
  async getWeatherContext(options = {}) {
    const currentTime = options.currentTime || Date.now();

    // 1. If an explicit WeatherContext was passed, check temporal validity
    if (options.weatherContext) {
      const ctx = options.weatherContext instanceof WeatherContext
        ? options.weatherContext
        : new WeatherContext(options.weatherContext);

      if (ctx.isExpired(currentTime)) {
        // Expired context returns clean baseline
        return WeatherContext.clear({
          evaluatedAt: currentTime,
          provenance: DataProvenance.estimated(
            'WeatherContextService',
            'Prior weather forecast expired; defaulted to baseline clear conditions'
          ).toJSON()
        });
      }
      return ctx;
    }

    // 2. If an explicit condition key was requested
    if (options.condition) {
      const conditionKey = normalizeWeatherCondition(options.condition);
      switch (conditionKey) {
        case WEATHER_CONDITIONS.RAIN:
          return WeatherContext.rain({ evaluatedAt: currentTime, ...options });
        case WEATHER_CONDITIONS.HEAVY_RAIN:
          return WeatherContext.heavyRain({ evaluatedAt: currentTime, ...options });
        case WEATHER_CONDITIONS.SEVERE:
          return WeatherContext.severe({ evaluatedAt: currentTime, ...options });
        case WEATHER_CONDITIONS.EXTREME_HEAT:
          return WeatherContext.extremeHeat({ evaluatedAt: currentTime, ...options });
        case WEATHER_CONDITIONS.CLEAR:
        default:
          return WeatherContext.clear({ evaluatedAt: currentTime, ...options });
      }
    }

    // 3. Query existing external weather provider if configured
    if (this.weatherProvider && typeof this.weatherProvider.getMumbaiWeather === 'function') {
      try {
        const raw = await this.weatherProvider.getMumbaiWeather();
        if (raw) {
          return this.normalizeProviderWeather(raw, currentTime);
        }
      } catch (err) {
        // Silently fallback to clean weather
      }
    }

    // 4. Default clean fallback
    return WeatherContext.clear({ evaluatedAt: currentTime });
  }

  /**
   * Normalizes raw response from external provider (e.g. Open-Meteo or fallback)
   * into a standard commute-focused WeatherContext.
   *
   * @param {object} raw
   * @param {number} [currentTime=Date.now()]
   * @returns {WeatherContext}
   */
  normalizeProviderWeather(raw, currentTime = Date.now()) {
    const rawCond = (raw.condition || '').toLowerCase();
    const rainProb = typeof raw.rainProbability === 'number' ? raw.rainProbability : 0;
    const precipMm = typeof raw.precipitationMm === 'number' ? raw.precipitationMm : 0;
    const tempC = typeof raw.temperatureC === 'number' ? raw.temperatureC : 28;
    const feelsLikeC = typeof raw.feelsLikeC === 'number' ? raw.feelsLikeC : tempC;

    let condition = WEATHER_CONDITIONS.CLEAR;
    if (rawCond.includes('thunderstorm') || raw.rainRisk === 'severe') {
      condition = WEATHER_CONDITIONS.SEVERE;
    } else if (raw.rainRisk === 'high' || rainProb >= 80 || precipMm >= 15 || rawCond.includes('heavy rain')) {
      condition = WEATHER_CONDITIONS.HEAVY_RAIN;
    } else if (raw.rainRisk === 'medium' || rainProb >= 40 || precipMm > 1 || rawCond.includes('rain') || rawCond.includes('drizzle')) {
      condition = WEATHER_CONDITIONS.RAIN;
    } else if (tempC >= 40 || feelsLikeC >= 45) {
      condition = WEATHER_CONDITIONS.EXTREME_HEAT;
    }

    const providerName = raw.source || 'Open-Meteo Weather API';
    const description = `Observed ${condition} with ${rainProb}% rain probability`;
    const provenance = raw.source && raw.source.includes('API')
      ? DataProvenance.estimated(providerName, description)
      : DataProvenance.synthetic(providerName, description);

    switch (condition) {
      case WEATHER_CONDITIONS.SEVERE:
        return WeatherContext.severe({
          temperatureC: tempC,
          feelsLikeC,
          humidity: raw.humidity,
          precipitationProbability: rainProb,
          advisory: raw.advisory,
          provenance: provenance.toJSON(),
          evaluatedAt: currentTime
        });
      case WEATHER_CONDITIONS.HEAVY_RAIN:
        return WeatherContext.heavyRain({
          temperatureC: tempC,
          feelsLikeC,
          humidity: raw.humidity,
          precipitationProbability: rainProb,
          advisory: raw.advisory,
          provenance: provenance.toJSON(),
          evaluatedAt: currentTime
        });
      case WEATHER_CONDITIONS.RAIN:
        return WeatherContext.rain({
          temperatureC: tempC,
          feelsLikeC,
          humidity: raw.humidity,
          precipitationProbability: rainProb,
          advisory: raw.advisory,
          provenance: provenance.toJSON(),
          evaluatedAt: currentTime
        });
      case WEATHER_CONDITIONS.EXTREME_HEAT:
        return WeatherContext.extremeHeat({
          temperatureC: tempC,
          feelsLikeC,
          humidity: raw.humidity,
          provenance: provenance.toJSON(),
          evaluatedAt: currentTime
        });
      case WEATHER_CONDITIONS.CLEAR:
      default:
        return WeatherContext.clear({
          temperatureC: tempC,
          feelsLikeC,
          humidity: raw.humidity,
          precipitationProbability: rainProb,
          provenance: provenance.toJSON(),
          evaluatedAt: currentTime
        });
    }
  }

  /**
   * Deterministically evaluates the impact of weather conditions on a candidate journey.
   *
   * @param {CommuteJourney|object} journey Candidate journey
   * @param {WeatherContext|object} [weatherContextInput] Weather context or options
   * @param {object} [options={}]
   * @param {number} [options.currentTime=Date.now()] Reference timestamp
   * @returns {JourneyWeatherImpact}
   */
  evaluateJourneyWeatherImpact(journey, weatherContextInput, options = {}) {
    if (!journey || !Array.isArray(journey.segments)) {
      throw new Error('Valid journey with segments array is required for weather impact evaluation');
    }

    const currentTime = options.currentTime || Date.now();

    // 1. Resolve WeatherContext
    let context;
    if (weatherContextInput instanceof WeatherContext) {
      context = weatherContextInput;
    } else if (weatherContextInput && typeof weatherContextInput === 'object' && weatherContextInput.condition) {
      context = new WeatherContext(weatherContextInput);
    } else if (typeof weatherContextInput === 'string') {
      const condKey = normalizeWeatherCondition(weatherContextInput);
      context = this._buildContextForCondition(condKey, currentTime);
    } else {
      context = WeatherContext.clear({ evaluatedAt: currentTime });
    }

    // 2. Handle expired weather context (falls back to clean baseline)
    if (context.isExpired(currentTime)) {
      return new JourneyWeatherImpact({
        journeyId: journey.id,
        weatherCondition: WEATHER_CONDITIONS.CLEAR,
        isAffected: false,
        walkingInconvenience: {
          level: WALKING_INCONVENIENCE_LEVELS.NONE,
          score: 0,
          outdoorWalkMinutes: 0,
          addedWalkFatigueMinutes: 0,
          advisory: 'Previous weather context expired; baseline clear travel conditions applied.'
        },
        roadDelay: {
          estimatedDelayMinutes: 0,
          affectedRoadSegmentsCount: 0,
          affectedRoadSegmentIndices: []
        },
        travelUncertainty: {
          level: TRAVEL_UNCERTAINTY_LEVELS.LOW,
          varianceMinutes: 0,
          recommendEarlyDepartureMinutes: 0
        },
        affectedOutdoorSegments: [],
        shelteredSegments: [],
        totalAddedTravelTimeMinutes: 0,
        originalDurationMinutes: journey.durationMinutes || 0,
        updatedDurationMinutes: journey.durationMinutes || 0,
        isImpractical: false,
        advisories: ['Prior weather data expired; assuming normal travel conditions.'],
        dataTiers: [PROVENANCE_TIERS.ESTIMATED],
        provenance: DataProvenance.estimated(
          'WeatherContextService',
          'Evaluated against expired weather; defaulted to clear baseline'
        ).toJSON(),
        evaluatedAt: currentTime
      });
    }

    const condition = context.condition || WEATHER_CONDITIONS.CLEAR;
    const factors = WEATHER_SEVERITY_FACTORS[condition] || WEATHER_SEVERITY_FACTORS[WEATHER_CONDITIONS.CLEAR];

    // 3. Segment analysis: Outdoor walk vs Road vs Sheltered
    let totalOutdoorWalkMinutes = 0;
    const affectedOutdoorSegments = [];
    const shelteredSegments = [];
    const affectedRoadSegmentIndices = [];

    journey.segments.forEach((seg, idx) => {
      const mode = String(seg.mode || '').toLowerCase();
      const type = String(seg.type || '').toLowerCase();
      const duration = Number(seg.durationMinutes || 0);

      // A. Outdoor Walk Segments
      if (mode === TRANSPORT_MODES.WALK || type === 'walk') {
        totalOutdoorWalkMinutes += duration;
        affectedOutdoorSegments.push({
          segmentIndex: idx,
          mode: TRANSPORT_MODES.WALK,
          from: seg.from,
          to: seg.to,
          outdoorDurationMinutes: duration,
          exposureRisk: factors.outdoorExposureRisk,
          advisory: condition !== WEATHER_CONDITIONS.CLEAR
            ? `Outdoor walking exposed to ${factors.label.toLowerCase()}`
            : 'Normal outdoor walk'
        });
      }
      // B. Road Transit Segments (Auto, Shared Auto, Bus)
      else if (ROAD_TRANSPORT_MODES.includes(mode)) {
        affectedRoadSegmentIndices.push(idx);

        // Autos and shared autos have open side canopies (partial outdoor exposure)
        if (mode === 'auto' || mode === 'shared_auto') {
          affectedOutdoorSegments.push({
            segmentIndex: idx,
            mode,
            from: seg.from,
            to: seg.to,
            outdoorDurationMinutes: duration,
            exposureRisk: condition === WEATHER_CONDITIONS.CLEAR ? OUTDOOR_EXPOSURE_RISKS.NONE : OUTDOOR_EXPOSURE_RISKS.MODERATE,
            advisory: condition !== WEATHER_CONDITIONS.CLEAR
              ? 'Open-sided auto rickshaw exposed to rain spray and road splash'
              : 'Standard auto commute'
          });
        }
      }
      // C. Sheltered Fixed Rail Transit (Metro, Train)
      else if (SHELTERED_TRANSPORT_MODES.includes(mode)) {
        shelteredSegments.push({
          segmentIndex: idx,
          mode,
          lineIdentifier: seg.lineIdentifier || seg.serviceId || '',
          from: seg.from,
          to: seg.to,
          isSheltered: true
        });
      }
    });

    // 4. Compute Walking Inconvenience
    let walkScore = 0;
    let addedWalkFatigueMinutes = 0;

    if (condition !== WEATHER_CONDITIONS.CLEAR && totalOutdoorWalkMinutes > 0) {
      switch (condition) {
        case WEATHER_CONDITIONS.RAIN:
          walkScore = Math.min(100, Math.round(25 + totalOutdoorWalkMinutes * 2));
          addedWalkFatigueMinutes = Math.max(1, Math.ceil(totalOutdoorWalkMinutes * factors.walkingFatigueFactor));
          break;
        case WEATHER_CONDITIONS.HEAVY_RAIN:
          walkScore = Math.min(100, Math.round(55 + totalOutdoorWalkMinutes * 3));
          addedWalkFatigueMinutes = Math.max(2, Math.ceil(totalOutdoorWalkMinutes * factors.walkingFatigueFactor));
          break;
        case WEATHER_CONDITIONS.SEVERE:
          walkScore = Math.min(100, Math.round(75 + totalOutdoorWalkMinutes * 3.5));
          addedWalkFatigueMinutes = Math.max(4, Math.ceil(totalOutdoorWalkMinutes * factors.walkingFatigueFactor));
          break;
        case WEATHER_CONDITIONS.EXTREME_HEAT:
          walkScore = Math.min(100, Math.round(40 + totalOutdoorWalkMinutes * 3));
          addedWalkFatigueMinutes = Math.max(2, Math.ceil(totalOutdoorWalkMinutes * factors.walkingFatigueFactor));
          break;
      }
    }

    const walkingInconvenience = {
      level: totalOutdoorWalkMinutes > 0 ? factors.walkingInconvenienceLevel : WALKING_INCONVENIENCE_LEVELS.NONE,
      score: walkScore,
      outdoorWalkMinutes: totalOutdoorWalkMinutes,
      addedWalkFatigueMinutes,
      advisory: totalOutdoorWalkMinutes > 0 && condition !== WEATHER_CONDITIONS.CLEAR
        ? `${totalOutdoorWalkMinutes} min outdoor walk under ${factors.label.toLowerCase()}`
        : 'No significant walking weather inconvenience'
    };

    // 5. Compute Road Delays
    const affectedRoadSegmentsCount = affectedRoadSegmentIndices.length;
    const estimatedRoadDelayMinutes = affectedRoadSegmentsCount * factors.roadDelayMinutesPerSegment;

    const roadDelay = {
      estimatedDelayMinutes: estimatedRoadDelayMinutes,
      affectedRoadSegmentsCount,
      affectedRoadSegmentIndices
    };

    // 6. Compute Travel Uncertainty
    const travelUncertainty = {
      level: factors.travelUncertaintyLevel,
      varianceMinutes: factors.uncertaintyVarianceMinutes,
      recommendEarlyDepartureMinutes: factors.recommendEarlyDepartureMinutes
    };

    // 7. Overall Added Travel Time
    const totalAddedTravelTimeMinutes = addedWalkFatigueMinutes + estimatedRoadDelayMinutes;
    const originalDurationMinutes = Number(journey.totalDurationMinutes || journey.durationMinutes || 0);
    const updatedDurationMinutes = originalDurationMinutes + totalAddedTravelTimeMinutes;

    // 8. Viability & Impracticality Check
    // Rule: Never declare a route impossible solely for mild weather.
    // Even in heavy rain or extreme heat, routes remain viable with alerts.
    let isImpractical = false;
    let impracticalReason = null;

    if (condition === WEATHER_CONDITIONS.SEVERE && options.severeIsImpractical) {
      isImpractical = true;
      impracticalReason = 'Severe weather conditions exceed safe transit operating thresholds';
    }

    // 9. Advisories
    const advisories = [];
    if (context.advisory) {
      advisories.push(context.advisory);
    }
    if (factors.recommendEarlyDepartureMinutes > 0) {
      advisories.push(`Recommended departure: leave ${factors.recommendEarlyDepartureMinutes} minutes earlier to maintain schedule.`);
    }
    if (totalOutdoorWalkMinutes > 10 && [WEATHER_CONDITIONS.HEAVY_RAIN, WEATHER_CONDITIONS.SEVERE].includes(condition)) {
      advisories.push(`Extended walking (${totalOutdoorWalkMinutes} min) exposed to torrential rain. Consider sheltered transit alternatives.`);
    }
    if (condition === WEATHER_CONDITIONS.EXTREME_HEAT && totalOutdoorWalkMinutes > 10) {
      advisories.push(`Extended walking (${totalOutdoorWalkMinutes} min) during extreme heat. Maintain hydration and seek shade.`);
    }

    // 10. Data Provenance Propagation
    const dataTiers = new Set();
    if (context.provenance?.sourceTier) {
      dataTiers.add(context.provenance.sourceTier);
    }
    if (Array.isArray(context.conditions)) {
      context.conditions.forEach(c => {
        if (c.provenance?.sourceTier) {
          dataTiers.add(c.provenance.sourceTier);
        }
      });
    }
    if (dataTiers.size === 0) {
      dataTiers.add(PROVENANCE_TIERS.ESTIMATED);
    }

    const isAffected = condition !== WEATHER_CONDITIONS.CLEAR && (totalAddedTravelTimeMinutes > 0 || totalOutdoorWalkMinutes > 0 || factors.travelUncertaintyLevel !== TRAVEL_UNCERTAINTY_LEVELS.LOW);

    return new JourneyWeatherImpact({
      journeyId: journey.id,
      weatherCondition: condition,
      isAffected,
      walkingInconvenience,
      roadDelay,
      travelUncertainty,
      affectedOutdoorSegments,
      shelteredSegments,
      totalAddedTravelTimeMinutes,
      originalDurationMinutes,
      updatedDurationMinutes,
      isImpractical,
      impracticalReason,
      advisories,
      dataTiers: Array.from(dataTiers),
      provenance: context.provenance || DataProvenance.estimated('WeatherContextService').toJSON(),
      evaluatedAt: currentTime
    });
  }

  /**
   * Applies evaluated weather impact to a candidate journey.
   *
   * @param {CommuteJourney|object} journey
   * @param {JourneyWeatherImpact} weatherImpact
   * @returns {CommuteJourney|object}
   */
  applyWeatherImpactToJourney(journey, weatherImpact) {
    if (!journey || !weatherImpact) return journey;

    journey.weatherImpact = typeof weatherImpact.toJSON === 'function'
      ? weatherImpact.toJSON()
      : weatherImpact;

    if (weatherImpact.totalAddedTravelTimeMinutes > 0) {
      if (journey.totalDurationMinutes !== undefined) {
        journey.totalDurationMinutes += weatherImpact.totalAddedTravelTimeMinutes;
      }
      if (journey.durationMinutes !== undefined) {
        journey.durationMinutes += weatherImpact.totalAddedTravelTimeMinutes;
      }

      const totalDur = journey.totalDurationMinutes !== undefined
        ? journey.totalDurationMinutes
        : journey.durationMinutes;

      const originalArrival = journey.estimatedArrivalTime || journey.arrivalTime || '08:30';
      const newArrival = addMinutesToHHMM(originalArrival, weatherImpact.totalAddedTravelTimeMinutes);
      if (journey.estimatedArrivalTime !== undefined) {
        journey.estimatedArrivalTime = newArrival;
      }
      if (journey.arrivalTime !== undefined) {
        journey.arrivalTime = newArrival;
      }
    }

    if (weatherImpact.isImpractical) {
      journey.isViable = false;
      journey.impracticalReason = weatherImpact.impracticalReason;
    }

    return journey;
  }

  /**
   * Internal helper building standard context instance for condition key.
   * @private
   */
  _buildContextForCondition(conditionKey, currentTime) {
    switch (conditionKey) {
      case WEATHER_CONDITIONS.RAIN:
        return WeatherContext.rain({ evaluatedAt: currentTime });
      case WEATHER_CONDITIONS.HEAVY_RAIN:
        return WeatherContext.heavyRain({ evaluatedAt: currentTime });
      case WEATHER_CONDITIONS.SEVERE:
        return WeatherContext.severe({ evaluatedAt: currentTime });
      case WEATHER_CONDITIONS.EXTREME_HEAT:
        return WeatherContext.extremeHeat({ evaluatedAt: currentTime });
      case WEATHER_CONDITIONS.CLEAR:
      default:
        return WeatherContext.clear({ evaluatedAt: currentTime });
    }
  }
}

const weatherContextService = new WeatherContextService();

module.exports = {
  WeatherContextService,
  weatherContextService,
  ROAD_TRANSPORT_MODES,
  SHELTERED_TRANSPORT_MODES
};
