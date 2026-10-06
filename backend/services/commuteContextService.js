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

class CommuteContextService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.studentProfileRepo]
   * @param {object} [options.studentPreferenceRepo]
   * @param {object} [options.weatherService]
   */
  constructor(options = {}) {
    this.studentProfileRepo = options.studentProfileRepo || studentProfileRepository;
    this.studentPreferenceRepo = options.studentPreferenceRepo || studentCommutePreferenceRepository;
    this.weatherService = options.weatherService || null;
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
    let weatherContext = {
      condition: 'clear',
      rainProbability: 0,
      temperatureC: 28,
      advisory: 'Normal commute conditions'
    };

    if (this.weatherService) {
      try {
        if (typeof this.weatherService.getMumbaiWeather === 'function') {
          const w = await this.weatherService.getMumbaiWeather();
          if (w) {
            weatherContext = {
              condition: w.condition || (w.rainProbability > 50 ? 'rainy' : 'clear'),
              rainProbability: typeof w.rainProbability === 'number' ? w.rainProbability : 0,
              temperatureC: w.temperatureC || 28,
              advisory: w.advisory || (w.rainProbability > 50 ? 'Monsoon showers probable; carry rain protection.' : 'Normal commute conditions')
            };
          }
        }
      } catch (err) {
        // Fallback safely to clear weather if external weather query fails
      }
    }

    // 5. Construct normalized context object
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
      provenance: DataProvenance.synthetic('CommuteContextService').toJSON()
    };
  }
}

const commuteContextService = new CommuteContextService();

module.exports = {
  CommuteContextService,
  commuteContextService
};
