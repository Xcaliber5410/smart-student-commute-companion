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
   * Retrieves active/recent ride groups with pagination and filtering.
   *
   * @param {object|number} [options=20]
   * @returns {{ groups: object[], pagination: object }}
   */
  listRideGroups(options = 20) {
    const opts = typeof options === 'number' ? { limit: options } : (options || {});
    const result = this.repo.findWithPagination(opts);
    return {
      groups: result.data.map(g => (g.toRow ? g.toRow() : g)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1
      }
    };
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

  /**
   * Removes a member from an existing ride group.
   *
   * @param {string} id
   * @returns {object}
   */
  leaveRideGroup(id) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError('Ride group not found');
    }

    if (group.current_members <= 1) {
      throw new BadRequestError('Cannot leave group as the only remaining member', 'MINIMUM_MEMBERSHIP_REACHED');
    }

    const updated = this.repo.decrementMembers(id);
    return updated.toRow ? updated.toRow() : updated;
  }

  /**
   * Asserts whether a user has permission to mutate a ride group.
   *
   * @param {object} group
   * @param {object} [user]
   * @returns {boolean}
   */
  assertOwnership(group, user) {
    if (!user) return true;
    if (user.role === 'admin') return true;
    const creator = group.creator_pseudonym || group.creator_id;
    if (creator && (creator === user.full_name || creator === user.id || creator === user.email)) {
      return true;
    }
    return false;
  }

  /**
   * Updates an existing ride group.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {object}
   */
  updateRideGroup(id, updates) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError(`Ride group with id '${id}' not found`);
    }

    if (updates.max_members !== undefined && updates.max_members < group.current_members) {
      throw new BadRequestError(
        `Max members (${updates.max_members}) cannot be less than current member count (${group.current_members})`,
        'INVALID_CAPACITY'
      );
    }

    const updated = this.repo.update(id, updates);
    return updated.toRow ? updated.toRow() : updated;
  }

  /**
   * Deletes an existing ride group.
   *
   * @param {string} id
   * @returns {boolean}
   */
  deleteRideGroup(id) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError(`Ride group with id '${id}' not found`);
    }

    return this.repo.delete(id);
  }
}

module.exports = {
  RideGroupService,
  rideGroupService: new RideGroupService()
};
