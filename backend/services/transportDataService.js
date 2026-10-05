/**
 * TransportDataService
 *
 * Domain service providing clean transport data abstractions:
 * - Transport service lines, modes, agencies
 * - Ordered route stops and station hubs
 * - Scheduled departure/arrival timetables and estimated durations
 * - Line availability status (OPERATIONAL, DELAYED, SUSPENDED)
 * - 4-tier provenance labeling on all returned transit intelligence
 */

const { transportRepository } = require('../repositories/TransportRepository');
const { ValidationError, NotFoundError } = require('../errors');
const { isValidTransportMode } = require('../models/CommuteContracts');

class TransportDataService {
  constructor(repository = transportRepository) {
    this.repo = repository;
  }

  /**
   * Initializes / seeds transport data if empty.
   */
  ensureSeedData() {
    return this.repo.seedInitialTransportData();
  }

  /**
   * Retrieves all services matching a transport mode.
   * @param {string} mode
   * @returns {object[]}
   */
  getServicesByMode(mode) {
    if (mode && !isValidTransportMode(mode)) {
      throw new ValidationError(`Unsupported transport mode: ${mode}`);
    }
    const services = mode ? this.repo.findServicesByMode(mode) : [];
    return services.map(s => s.toJSON());
  }

  /**
   * Retrieves details of a specific line identifier (e.g. 'WR-SLOW', 'Line-1').
   * @param {string} lineIdentifier
   * @returns {object}
   */
  getLineDetails(lineIdentifier) {
    if (!lineIdentifier) throw new ValidationError('Line identifier is required');
    const service = this.repo.findServicesByLine(lineIdentifier);
    if (!service) {
      throw new NotFoundError(`Transport service with line '${lineIdentifier}' not found`);
    }
    return service.toJSON();
  }

  /**
   * Finds transit lines that connect two areas directly.
   * @param {string} originArea
   * @param {string} destArea
   * @returns {object[]}
   */
  getDirectServices(originArea, destArea) {
    if (!originArea || !destArea) {
      throw new ValidationError('Both origin and destination areas are required');
    }
    const services = this.repo.findServicesConnectingAreas(originArea, destArea);
    return services.map(s => s.toJSON());
  }

  /**
   * Retrieves stops along a route line.
   * @param {string} lineIdentifier
   * @returns {object[]}
   */
  getStopsForLine(lineIdentifier) {
    const service = this.repo.findServicesByLine(lineIdentifier);
    if (!service) {
      throw new NotFoundError(`Transport service with line '${lineIdentifier}' not found`);
    }
    return service.getStops().map(st => st.toJSON());
  }

  /**
   * Finds upcoming timetable schedules between two stations after a given time.
   * @param {string} fromStopId
   * @param {string} toStopId
   * @param {string} [afterTime]
   * @returns {object[]}
   */
  getUpcomingSchedules(fromStopId, toStopId, afterTime) {
    if (!fromStopId || !toStopId) {
      throw new ValidationError('Both origin and destination stop IDs are required');
    }
    const schedules = this.repo.findSchedules(fromStopId, toStopId, { afterTime });
    return schedules.map(sc => sc.toJSON());
  }

  /**
   * Updates line availability status.
   * @param {string} lineIdentifier
   * @param {'OPERATIONAL'|'DELAYED'|'SUSPENDED'|'LIMITED_SERVICE'} status
   * @returns {object}
   */
  setLineAvailability(lineIdentifier, status) {
    const service = this.repo.findServicesByLine(lineIdentifier);
    if (!service) {
      throw new NotFoundError(`Transport service with line '${lineIdentifier}' not found`);
    }
    this.repo.updateServiceStatus(service.id, status);
    return this.getLineDetails(lineIdentifier);
  }
}

const transportDataService = new TransportDataService();

module.exports = {
  TransportDataService,
  transportDataService
};
