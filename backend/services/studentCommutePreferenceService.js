/**
 * StudentCommutePreferenceService
 *
 * Encapsulates business logic, ownership access controls, and privacy boundaries
 * for student commute preferences and constraints (P9).
 *
 * Responsibilities:
 * 1. Enforces student-only/admin-only ownership (no cross-student preference tampering)
 * 2. Rejects granular residential addresses and GPS telemetry
 * 3. Provides sensible defaults when initial preferences are created
 * 4. Supplies CommuteConstraint instances for the recommendation pipeline
 */

const { userRepository } = require('../repositories/UserRepository');
const {
  studentCommutePreferenceRepository
} = require('../repositories/StudentCommutePreferenceRepository');
const { StudentCommutePreference } = require('../models/StudentCommutePreference');
const {
  validateCommutePreferences
} = require('../validators/commutePreferenceValidators');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class StudentCommutePreferenceService {
  /**
   * @param {object} [userRepo]
   * @param {object} [preferenceRepo]
   */
  constructor(
    userRepo = userRepository,
    preferenceRepo = studentCommutePreferenceRepository
  ) {
    this.userRepo = userRepo;
    this.preferenceRepo = preferenceRepo;
  }

  /**
   * Asserts whether the requesting user has permission to manage the target preferences.
   *
   * @param {string} targetUserId
   * @param {object} requestingUser
   */
  assertOwnership(targetUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student commute preferences');
    }

    if (requestingUser.role === 'admin' || requestingUser.id === targetUserId) {
      return true;
    }

    throw new ForbiddenError("Access forbidden: you do not have permission to access another student's private commute preferences");
  }

  /**
   * Retrieves commute preferences for a student with sensible defaults.
   *
   * @param {string} targetUserId
   * @param {object} requestingUser
   * @returns {StudentCommutePreference}
   */
  getPreferences(targetUserId, requestingUser) {
    this.assertOwnership(targetUserId, requestingUser);

    const user = this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${targetUserId}' not found`);
    }

    let pref = this.preferenceRepo.findByUserId(targetUserId);
    if (!pref) {
      // Provision initial sensible defaults
      pref = this.preferenceRepo.upsert(targetUserId, {
        default_destination_college: user.college_name || ''
      });
    }

    return pref;
  }

  /**
   * Updates commute preferences for an authenticated student.
   *
   * @param {string} targetUserId
   * @param {object} updates
   * @param {object} requestingUser
   * @returns {StudentCommutePreference}
   */
  updatePreferences(targetUserId, updates = {}, requestingUser) {
    this.assertOwnership(targetUserId, requestingUser);

    const user = this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${targetUserId}' not found`);
    }

    // Validate update inputs and assert privacy boundaries
    let validated;
    try {
      validated = validateCommutePreferences(updates);
    } catch (err) {
      if (err.statusCode === 400 || err.name === 'ZodError') {
        throw new BadRequestError(err.message, 'VALIDATION_ERROR', err.issues || null);
      }
      throw err;
    }

    return this.preferenceRepo.upsert(targetUserId, validated);
  }

  /**
   * Resets student commute preferences to system defaults.
   *
   * @param {string} targetUserId
   * @param {object} requestingUser
   * @returns {StudentCommutePreference}
   */
  resetPreferences(targetUserId, requestingUser) {
    this.assertOwnership(targetUserId, requestingUser);

    const user = this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${targetUserId}' not found`);
    }

    return this.preferenceRepo.resetToDefaults(targetUserId);
  }

  /**
   * Generates a pipeline CommuteConstraint for a student, merging saved preferences
   * with per-request overrides.
   *
   * @param {string} studentId
   * @param {object} [runtimeOverrides={}]
   * @returns {object} CommuteConstraint
   */
  getCommuteConstraint(studentId, runtimeOverrides = {}) {
    if (!studentId) {
      return StudentCommutePreference.createDefault('anonymous').toConstraint(runtimeOverrides);
    }

    const pref = this.preferenceRepo.findByUserId(studentId);
    if (!pref) {
      return StudentCommutePreference.createDefault(studentId).toConstraint(runtimeOverrides);
    }

    return pref.toConstraint(runtimeOverrides);
  }
}

const studentCommutePreferenceService = new StudentCommutePreferenceService();

module.exports = {
  StudentCommutePreferenceService,
  studentCommutePreferenceService
};
