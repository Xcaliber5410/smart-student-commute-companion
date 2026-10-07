/**
 * CommuteContextService
 *
 * Stage 1 of the Commute Recommendation Pipeline.
 * Collects contextual signals required for personalized, weather-aware,
 * and schedule-aligned commute planning without violating student privacy.
 *
 * Privacy Guarantees:
 * - Operates strictly over coarse area abstractions (CommuteArea)
 * - Zero storage or collection of GPS trails, home addresses, or device identifiers
 */

const { DataProvenance, CommutePlanInputDTO } = require('../models');
const { getMumbaiDayOfWeek, getMumbaiTimeHHMM } = require('../utils/timezone');
const { studentProfileRepository } = require('../repositories/StudentProfileRepository');
const { studentCommutePreferenceRepository } = require('../repositories/StudentCommutePreferenceRepository');
const { trafficService } = require('./trafficService');
const { weatherContextService } = require('./weatherContextService');
const { transportAvailabilityService } = require('./transportAvailabilityService');
const { isStatusUsable } = require('../models/TransportAvailability');

class CommuteContextService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.studentProfileRepo]
   * @param {object} [options.studentPreferenceRepo]
   * @param {object} [options.weatherService]
   * @param {object} [options.weatherContextService]
   * @param {object} [options.trafficService]
   * @param {object} [options.transportAvailabilityService]
   */
  constructor(options = {}) {
    this.studentProfileRepo = options.studentProfileRepo || studentProfileRepository;
    this.studentPreferenceRepo = options.studentPreferenceRepo || studentCommutePreferenceRepository;
    this.weatherService = options.weatherService || null;
    this.weatherContextService = options.weatherContextService || weatherContextService;
    this.trafficService = options.trafficService || trafficService;
    this.transportAvailabilityService = options.transportAvailabilityService || transportAvailabilityService;
  }

  /**
   * Collects contextual metadata for an incoming commute planning request.
   *
   * @param {CommutePlanInputDTO|object} planInput
   * @param {object} [options={}]
   * @returns {Promise<object>} Normalized commute context
   */
  async collectContext(planInput, options = {}) {
    // 1. Ensure input is a valid CommutePlanInputDTO
    const dto = planInput instanceof CommutePlanInputDTO
      ? planInput
      : CommutePlanInputDTO.fromRequest(planInput);

    // 2. Determine temporal context in Mumbai IST
    const dayOfWeek = options.dayOfWeek || getMumbaiDayOfWeek();
    const currentTime = options.currentTime || getMumbaiTimeHHMM();
    const requestId = options.requestId || dto.requestId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 3. Retrieve student context if studentId is provided (optional profile enrichment)
    let studentProfile = null;
    let studentPreferences = null;
    const studentId = options.studentId || dto.studentId || null;
    if (studentId && this.studentProfileRepo && typeof this.studentProfileRepo.findByUserId === 'function') {
      try {
        studentProfile = await this.studentProfileRepo.findByUserId(studentId);
      } catch (err) {
        studentProfile = null;
      }
    }
    if (studentId && this.studentPreferenceRepo && typeof this.studentPreferenceRepo.findByUserId === 'function') {
      try {
        const prefEntity = await this.studentPreferenceRepo.findByUserId(studentId);
        studentPreferences = prefEntity ? prefEntity.toJSON() : null;
      } catch (err) {
        studentPreferences = null;
      }
    }

    // 4. Retrieve environmental/weather context
    let weatherContext = null;

    if (this.weatherService && typeof this.weatherService.getMumbaiWeather === 'function') {
      try {
        const w = await this.weatherService.getMumbaiWeather();
        if (w) {
          const normContext = this.weatherContextService.normalizeProviderWeather(w, Date.now());
          weatherContext = {
            ...normContext.toJSON(),
            condition: w.condition || normContext.condition,
            rainProbability: typeof w.rainProbability === 'number' ? w.rainProbability : normContext.precipitationProbability,
            temperatureC: w.temperatureC || normContext.temperatureC,
            advisory: w.advisory || normContext.advisory
          };
        }
      } catch (err) {
        weatherContext = null;
      }
    } else if (this.weatherContextService && typeof this.weatherContextService.getWeatherContext === 'function') {
      try {
        const wc = await this.weatherContextService.getWeatherContext(options);
        if (wc) {
          weatherContext = typeof wc.toJSON === 'function' ? wc.toJSON() : wc;
        }
      } catch (err) {
        weatherContext = null;
      }
    }

    if (!weatherContext) {
      weatherContext = {
        condition: 'clear',
        label: 'Clear / Normal',
        rainProbability: 0,
        precipitationProbability: 0,
        temperatureC: 28,
        feelsLikeC: 30,
        humidity: 70,
        advisory: 'Normal commute conditions',
        walkingInconvenienceLevel: 'NONE',
        roadDelayMinutes: 0,
        travelUncertaintyLevel: 'LOW',
        outdoorExposureRisk: 'NONE',
        recommendEarlyDepartureMinutes: 0,
        conditions: [],
        provenance: DataProvenance.synthetic('WeatherContextService').toJSON()
      };
    }

    // 5. Retrieve road traffic context
    let trafficContext = {
      level: 'normal',
      expectedDelayMinutes: 0,
      advisory: 'Normal road traffic conditions',
      conditions: [],
      provenance: DataProvenance.synthetic('TrafficService').toJSON()
    };

    if (this.trafficService && typeof this.trafficService.getTrafficContext === 'function') {
      try {
        const originName = dto.originArea?.name || String(dto.originArea || '');
        const destName = dto.destinationArea?.name || String(dto.destinationArea || '');
        const tc = await this.trafficService.getTrafficContext(originName, destName, options);
        if (tc) {
          trafficContext = typeof tc.toJSON === 'function' ? tc.toJSON() : tc;
        }
      } catch (err) {
        // Fallback safely to normal traffic if traffic evaluation fails
      }
    }

    // 6. Retrieve transport availability context
    let availabilityContext = {
      status: 'AVAILABLE',
      isUsable: true,
      activeRecordsCount: 0,
      records: [],
      provenance: DataProvenance.synthetic('TransportAvailabilityService').toJSON()
    };

    if (this.transportAvailabilityService && typeof this.transportAvailabilityService.getActiveRecords === 'function') {
      try {
        const records = this.transportAvailabilityService.getActiveRecords(options);
        const nonAvailable = records.filter(r => r.status !== 'AVAILABLE');
        const dominantStatus = nonAvailable.find(r => !r.isUsable())?.status ||
          nonAvailable[0]?.status || 'AVAILABLE';

        availabilityContext = {
          status: dominantStatus,
          isUsable: isStatusUsable(dominantStatus),
          activeRecordsCount: records.length,
          records: records.map(r => (typeof r.toJSON === 'function' ? r.toJSON() : r)),
          provenance: DataProvenance.synthetic('TransportAvailabilityService').toJSON()
        };
      } catch (err) {
        // Fallback safely to standard availability
      }
    }

    // 7. Construct normalized context object
    return {
      requestId,
      originArea: dto.originArea,
      destinationArea: dto.destinationArea,
      desiredArrivalTime: dto.desiredArrivalTime,
      preferredModes: [...dto.preferredModes],
      constraints: dto.constraints,
      dayOfWeek,
      currentTime,
      studentId,
      studentProfile,
      studentPreferences,
      weatherContext,
      trafficContext,
      availabilityContext,
      provenance: DataProvenance.synthetic('CommuteContextService').toJSON()
    };
  }
}

const commuteContextService = new CommuteContextService();

module.exports = {
  CommuteContextService,
  commuteContextService
};
