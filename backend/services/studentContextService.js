/**
 * StudentContextService
 *
 * Encapsulates business logic for student profile management, default commute
 * preferences, and authenticated student context retrieval.
 */

const { userRepository } = require('../repositories/UserRepository');
const { studentProfileRepository } = require('../repositories/StudentProfileRepository');
const { StudentProfile } = require('../models/StudentProfile');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class StudentContextService {
  constructor(userRepo = userRepository, profileRepo = studentProfileRepository) {
    this.userRepo = userRepo;
    this.profileRepo = profileRepo;
  }

  /**
   * Asserts whether the requesting user has permission to access the target student context.
   *
   * @param {string} targetUserId
   * @param {object} requestingUser
   */
  assertAccess(targetUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student context');
    }

    if (requestingUser.role === 'admin' || requestingUser.id === targetUserId) {
      return true;
    }

    throw new ForbiddenError("Access forbidden: you do not have permission to access another student's private context");
  }

  /**
   * Retrieves the unified student context (account identity + commute profile + defaults).
   *
   * @param {string} targetUserId
   * @param {object} requestingUser
   * @returns {object}
   */
  getStudentContext(targetUserId, requestingUser) {
    this.assertAccess(targetUserId, requestingUser);

    const user = this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${targetUserId}' not found`);
    }

    let profile = this.profileRepo.findByUserId(targetUserId);
    if (!profile) {
      // Seed initial default profile if not yet customized
      profile = new StudentProfile({
        user_id: user.id,
        home_area: '',
        default_college: user.college_name || '',
        preferred_modes: ['train', 'metro', 'bus', 'auto', 'walk'],
        walking_tolerance_minutes: 20,
        max_budget_rupees: 100,
        default_arrival_time: '09:00'
      });
    }

    return {
      user: user.toSafeObject(),
      profile: profile.toJSON(),
      commuteDefaults: {
        home_area: profile.home_area,
        default_college: profile.default_college || user.college_name,
        preferred_modes: profile.preferred_modes,
        walking_tolerance_minutes: profile.walking_tolerance_minutes,
        max_budget_rupees: profile.max_budget_rupees,
        default_arrival_time: profile.default_arrival_time
      }
    };
  }

  /**
   * Updates student commute preferences and optionally basic account profile.
   *
   * @param {string} targetUserId
   * @param {object} updates
   * @param {object} requestingUser
   * @returns {object}
   */
  updateStudentProfile(targetUserId, updates = {}, requestingUser) {
    this.assertAccess(targetUserId, requestingUser);

    const user = this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${targetUserId}' not found`);
    }

    // 1. Sync college_name or full_name on User model if provided
    const userUpdates = {};
    if (updates.full_name && updates.full_name.trim()) {
      userUpdates.full_name = updates.full_name.trim();
    }
    if (updates.college_name && updates.college_name.trim()) {
      userUpdates.college_name = updates.college_name.trim();
    }
    if (Object.keys(userUpdates).length > 0) {
      this.userRepo.update(targetUserId, userUpdates);
    }

    // 2. Validate and upsert profile fields
    const updatedProfile = this.profileRepo.upsert(targetUserId, updates);

    return this.getStudentContext(targetUserId, requestingUser);
  }
}

const studentContextService = new StudentContextService();

module.exports = {
  StudentContextService,
  studentContextService
};
