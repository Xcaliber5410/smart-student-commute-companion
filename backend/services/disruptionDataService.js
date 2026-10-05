/**
 * DisruptionDataService
 *
 * Domain service providing disruption intelligence abstractions:
 * - Active transit and road disruption lookups
 * - Corridor impact queries
 * - 4-tier provenance enforcement (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * - Severity and confidence scoring
 */

const { disruptionRepository } = require('../repositories/DisruptionRepository');
const { CommuteDisruption } = require('../models/CommuteDisruption');
const { ValidationError, NotFoundError } = require('../errors');
const { isValidTransportMode } = require('../models/CommuteContracts');

class DisruptionDataService {
  constructor(repository = disruptionRepository) {
    this.repo = repository;
  }

  /**
   * Initializes / seeds disruption data if empty.
   */
  ensureSeedData() {
    return this.repo.seedInitialDisruptions();
  }

  /**
   * Retrieves active disruptions with optional filtering.
   * @param {object} [filters={}]
   * @returns {object[]}
   */
  getActiveDisruptions(filters = {}) {
    if (filters.mode && !isValidTransportMode(filters.mode)) {
      throw new ValidationError(`Unsupported transport mode: ${filters.mode}`);
    }
    const disruptions = this.repo.findActive(filters);
    return disruptions.map(d => d.toJSON());
  }

  /**
   * Retrieves disruptions impacting a specific commute corridor or area.
   * @param {string} area
   * @param {string} [mode]
   * @returns {object[]}
   */
  getDisruptionsForCorridor(area, mode) {
    if (!area) throw new ValidationError('Area or corridor name is required');
    if (mode && !isValidTransportMode(mode)) {
      throw new ValidationError(`Unsupported transport mode: ${mode}`);
    }
    const disruptions = this.repo.findActive({ area, mode });
    return disruptions.map(d => d.toJSON());
  }

  /**
   * Registers a new disruption with explicit provenance.
   * @param {object} data
   * @returns {object}
   */
  recordDisruption(data) {
    const disruption = CommuteDisruption.create(data);
    const saved = this.repo.save(disruption);
    return saved.toJSON();
  }

  /**
   * Resolves an active disruption.
   * @param {string} id
   * @returns {boolean}
   */
  resolveDisruption(id) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Disruption with ID '${id}' not found`);
    }
    return this.repo.updateStatus(id, 'resolved');
  }

  /**
   * Synchronizes active crowdsourced reports into unified disruptions.
   * @returns {number} Count of synchronized reports
   */
  syncCommunityReports() {
    return this.repo.syncFromLiveReports();
  }
}

const disruptionDataService = new DisruptionDataService();

module.exports = {
  DisruptionDataService,
  disruptionDataService
};
