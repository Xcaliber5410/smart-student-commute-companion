/**
 * RideGroup Service
 *
 * Encapsulates business logic for student Travel Together ride groups:
 * capacity enforcement, joining rules, and retrieval.
 */

const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const { NotFoundError, BadRequestError } = require('../errors');

class RideGroupService {
  constructor(repo = rideGroupRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves active/recent ride groups.
   *
   * @param {number} [limit=20]
   * @returns {object[]}
   */
  listRideGroups(limit = 20) {
    const groups = this.repo.findRecent(limit);
    return groups.map(g => (g.toRow ? g.toRow() : g));
  }

  /**
   * Finds a ride group by ID.
   *
   * @param {string} id
   * @returns {object}
   */
  getRideGroupById(id) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError('Ride group not found');
    }
    return group.toRow ? group.toRow() : group;
  }

  /**
   * Creates a new student ride group.
   *
   * @param {object} groupData
   * @returns {object}
   */
  createRideGroup(groupData) {
    const created = this.repo.create(groupData);
    return created.toRow ? created.toRow() : created;
  }

  /**
   * Adds a student to an existing ride group, enforcing capacity limits.
   *
   * @param {string} id
   * @returns {object}
   */
  joinRideGroup(id) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError('Ride group not found');
    }

    if (group.isFull()) {
      throw new BadRequestError('This group is already full', 'GROUP_FULL');
    }

    const updated = this.repo.incrementMembers(id);
    return updated.toRow ? updated.toRow() : updated;
  }
}

module.exports = {
  RideGroupService,
  rideGroupService: new RideGroupService()
};
