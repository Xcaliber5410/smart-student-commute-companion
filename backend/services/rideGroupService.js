/**
 * RideGroup Service
 *
 * Encapsulates business logic for student Travel Together ride groups:
 * capacity enforcement, joining rules, and retrieval.
 */

const { rideGroupRepository } = require('../repositories/RideGroupRepository');
const { rideGroupMemberRepository } = require('../repositories/RideGroupMemberRepository');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../errors');

class RideGroupService {
  constructor(repo = rideGroupRepository, memberRepo = rideGroupMemberRepository) {
    this.repo = repo;
    this.memberRepo = memberRepo;
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
   * @param {object} [currentUser]
   * @returns {object}
   */
  createRideGroup(groupData, currentUser) {
    const created = this.repo.create(groupData);
    const row = created.toRow ? created.toRow() : created;

    if (currentUser && currentUser.id) {
      this.memberRepo.addMember(row.id, currentUser.id, 'creator');
    }

    return row;
  }

  /**
   * Adds a student to an existing ride group, enforcing capacity limits and membership rules.
   *
   * @param {string} id
   * @param {string|object} [userTokenOrUser]
   * @returns {object}
   */
  joinRideGroup(id, userTokenOrUser) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError('Ride group not found');
    }

    if (group.isFull()) {
      throw new BadRequestError('This group is already full', 'GROUP_FULL');
    }

    if (userTokenOrUser) {
      const identifier = typeof userTokenOrUser === 'string'
        ? userTokenOrUser
        : (userTokenOrUser.full_name || userTokenOrUser.email || userTokenOrUser.id);

      if (identifier && (group.creator_pseudonym === identifier || group.creator_id === identifier)) {
        throw new BadRequestError('Group creator is already a registered member of this group', 'CREATOR_ALREADY_MEMBER');
      }

      if (typeof userTokenOrUser === 'object' && userTokenOrUser.id) {
        if (this.memberRepo.isMember(id, userTokenOrUser.id)) {
          throw new BadRequestError('Student is already a registered member of this group', 'ALREADY_MEMBER');
        }
      }
    }

    try {
      const updated = this.repo.atomicJoin(id);
      if (userTokenOrUser && typeof userTokenOrUser === 'object' && userTokenOrUser.id) {
        this.memberRepo.addMember(id, userTokenOrUser.id, 'member');
      }
      return updated.toRow ? updated.toRow() : updated;
    } catch (err) {
      if (err.code === 'GROUP_FULL') {
        throw new BadRequestError('This group is already full', 'GROUP_FULL');
      }
      if (err.code === 'NOT_FOUND') {
        throw new NotFoundError('Ride group not found');
      }
      throw err;
    }
  }

  /**
   * Removes a member from an existing ride group atomically.
   *
   * @param {string} id
   * @param {string|object} [userTokenOrUser]
   * @returns {object}
   */
  leaveRideGroup(id, userTokenOrUser) {
    try {
      const updated = this.repo.atomicLeave(id);
      if (userTokenOrUser && typeof userTokenOrUser === 'object' && userTokenOrUser.id) {
        this.memberRepo.removeMember(id, userTokenOrUser.id);
      }
      return updated.toRow ? updated.toRow() : updated;
    } catch (err) {
      if (err.code === 'MINIMUM_MEMBERSHIP_REACHED') {
        throw new BadRequestError('Cannot leave group as the only remaining member', 'MINIMUM_MEMBERSHIP_REACHED');
      }
      if (err.code === 'NOT_FOUND') {
        throw new NotFoundError('Ride group not found');
      }
      throw err;
    }
  }

  /**
   * Retrieves all ride groups joined or created by a student.
   *
   * @param {string} userId
   * @param {object} requestingUser
   * @returns {object[]}
   */
  getStudentRideGroups(userId, requestingUser) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only view your own ride groups');
    }
    return this.memberRepo.findGroupsByUserId(userId);
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
   * Updates an existing ride group, enforcing capacity limits and ownership constraints.
   *
   * @param {string} id
   * @param {object} updates
   * @param {object} [currentUser]
   * @returns {object}
   */
  updateRideGroup(id, updates, currentUser) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError(`Ride group with id '${id}' not found`);
    }

    if (currentUser && !this.assertOwnership(group, currentUser)) {
      throw new ForbiddenError('You can only modify or delete ride groups that you created');
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
   * Deletes an existing ride group, enforcing ownership constraints.
   *
   * @param {string} id
   * @param {object} [currentUser]
   * @returns {boolean}
   */
  deleteRideGroup(id, currentUser) {
    const group = this.repo.findById(id);
    if (!group) {
      throw new NotFoundError(`Ride group with id '${id}' not found`);
    }

    if (currentUser && !this.assertOwnership(group, currentUser)) {
      throw new ForbiddenError('You can only modify or delete ride groups that you created');
    }

    return this.repo.delete(id);
  }
}

module.exports = {
  RideGroupService,
  rideGroupService: new RideGroupService()
};
