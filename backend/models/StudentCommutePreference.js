/**
 * StudentCommutePreference Domain Model
 *
 * Encapsulates a student's personal commute preferences and travel constraints (P9).
 * Directly translates student defaults into CommuteConstraint instances for the
 * recommendation engine pipeline.
 *
 * Privacy Guarantees:
 * - Operates strictly on coarse area abstractions (CommuteArea)
 * - Zero storage of residential street addresses, flat numbers, or housing society names
 * - Zero collection of GPS coordinates or continuous location telemetry
 */

const { z } = require('zod');
const {
  TRANSPORT_MODES,
  transportModeEnum,
  ROUTE_PREFERENCES,
  routePreferenceEnum,
  CommuteConstraint
} = require('./CommuteContracts');
const { checkAreaGranularity, sanitizeAreaName } = require('./CommuteArea');

// Route preference extended enum to support 'reliable' alongside standard preferences
const studentRoutePreferenceEnum = z.enum([
  'balanced',
  'fastest',
  'cheapest',
  'rain-safe',
  'reliable'
]);

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Coarse area validator that strictly prevents residential addresses
const privacyCoarseAreaValidator = z.string().trim().max(150)
  .superRefine((val, ctx) => {
    if (!val) return;
    const check = checkAreaGranularity(val);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.reason
      });
    }
  })
  .transform(val => (val ? sanitizeAreaName(val) : ''));

const studentCommutePreferenceSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  preferred_modes: z.array(transportModeEnum)
    .min(1, 'At least one preferred transport mode is required')
    .default([
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.WALK
    ]),
  walking_tolerance_minutes: z.coerce.number().int()
    .min(5, 'Walking tolerance must be at least 5 minutes')
    .max(60, 'Walking tolerance cannot exceed 60 minutes')
    .default(20),
  max_transfers: z.coerce.number().int()
    .min(0, 'Maximum transfers cannot be negative')
    .max(5, 'Maximum transfers cannot exceed 5')
    .default(3),
  max_budget_rupees: z.coerce.number()
    .min(0, 'Budget cannot be negative')
    .max(2000, 'Budget cannot exceed ₹2000')
    .default(100),
  route_preference: studentRoutePreferenceEnum.default('balanced'),
  default_arrival_time: z.string().trim().regex(timeRegex, 'Default arrival time must be in HH:MM format').default('09:00'),
  allow_shared_rides: z.boolean().default(true),
  require_wheelchair_access: z.boolean().default(false),
  default_origin_area: privacyCoarseAreaValidator.default(''),
  default_destination_college: privacyCoarseAreaValidator.default(''),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudentCommutePreference {
  /**
   * @param {object} data
   */
  constructor(data) {
    // Assert privacy: Reject any attempt to supply granular telemetry or personal address fields
    StudentCommutePreference.assertPrivacyPayload(data);

    const validated = studentCommutePreferenceSchema.parse(data);
    Object.assign(this, validated);
  }

  /**
   * Enforces privacy boundaries by forbidding continuous location history or exact addresses.
   * @param {object} payload
   */
  static assertPrivacyPayload(payload) {
    if (!payload || typeof payload !== 'object') return;

    const forbiddenFields = [
      'home_address',
      'residential_address',
      'flat_no',
      'room_no',
      'house_no',
      'building_name',
      'society_name',
      'gps_coordinates',
      'coordinates',
      'lat',
      'latitude',
      'lon',
      'lng',
      'longitude',
      'live_location',
      'continuous_tracking',
      'location_history',
      'device_id',
      'imei'
    ];

    for (const field of forbiddenFields) {
      if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
        throw new Error(`Privacy Boundary Violation: Storing '${field}' is strictly prohibited. Only coarse area names are permitted.`);
      }
    }
  }

  /**
   * Factory method to create default preferences for a new student.
   * @param {string} userId
   * @param {object} [overrides={}]
   * @returns {StudentCommutePreference}
   */
  static createDefault(userId, overrides = {}) {
    const now = Date.now();
    return new StudentCommutePreference({
      user_id: userId,
      preferred_modes: [
        TRANSPORT_MODES.TRAIN,
        TRANSPORT_MODES.METRO,
        TRANSPORT_MODES.BUS,
        TRANSPORT_MODES.AUTO,
        TRANSPORT_MODES.WALK
      ],
      walking_tolerance_minutes: 20,
      max_transfers: 3,
      max_budget_rupees: 100,
      route_preference: 'balanced',
      default_arrival_time: '09:00',
      allow_shared_rides: true,
      require_wheelchair_access: false,
      default_origin_area: '',
      default_destination_college: '',
      created_at: now,
      updated_at: now,
      ...overrides
    });
  }

  /**
   * Checks if a transport mode is allowed by this preference set.
   * @param {string} mode
   * @returns {boolean}
   */
  allowsMode(mode) {
    return this.preferred_modes.includes(mode);
  }

  /**
   * Checks if an estimated fare is within student's budget preference.
   * @param {number} fareRupees
   * @returns {boolean}
   */
  isWithinBudget(fareRupees) {
    return Number(fareRupees) <= this.max_budget_rupees;
  }

  /**
   * Checks if walking duration is within tolerance.
   * @param {number} minutes
   * @returns {boolean}
   */
  isWithinWalkingLimit(minutes) {
    return Number(minutes) <= this.walking_tolerance_minutes;
  }

  /**
   * Converts student commute preferences into a pipeline-ready CommuteConstraint.
   * @param {object} [runtimeOverrides={}]
   * @returns {CommuteConstraint}
   */
  toConstraint(runtimeOverrides = {}) {
    return new CommuteConstraint({
      maxBudgetRupees: runtimeOverrides.maxBudgetRupees !== undefined ? runtimeOverrides.maxBudgetRupees : this.max_budget_rupees,
      walkingToleranceMinutes: runtimeOverrides.walkingToleranceMinutes !== undefined ? runtimeOverrides.walkingToleranceMinutes : this.walking_tolerance_minutes,
      preferredModes: runtimeOverrides.preferredModes || [...this.preferred_modes],
      preference: (runtimeOverrides.preference || (this.route_preference === 'reliable' ? ROUTE_PREFERENCES.BALANCED : this.route_preference)),
      maxTransfers: runtimeOverrides.maxTransfers !== undefined ? runtimeOverrides.maxTransfers : this.max_transfers,
      desiredArrivalTime: runtimeOverrides.desiredArrivalTime || this.default_arrival_time || undefined,
      requireWheelchairAccess: runtimeOverrides.requireWheelchairAccess !== undefined ? runtimeOverrides.requireWheelchairAccess : this.require_wheelchair_access,
      allowSharedRides: runtimeOverrides.allowSharedRides !== undefined ? runtimeOverrides.allowSharedRides : this.allow_shared_rides
    });
  }

  /**
   * Deserializes a database row into a StudentCommutePreference entity.
   * @param {object} row
   * @returns {StudentCommutePreference|null}
   */
  static fromRow(row) {
    if (!row) return null;

    let modes = [
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.WALK
    ];

    if (typeof row.preferred_modes === 'string') {
      try {
        const parsed = JSON.parse(row.preferred_modes);
        if (Array.isArray(parsed) && parsed.length > 0) {
          modes = parsed;
        }
      } catch (e) {
        // Fallback to default
      }
    } else if (Array.isArray(row.preferred_modes)) {
      modes = row.preferred_modes;
    }

    return new StudentCommutePreference({
      user_id: row.user_id,
      preferred_modes: modes,
      walking_tolerance_minutes: Number(row.walking_tolerance_minutes !== undefined ? row.walking_tolerance_minutes : 20),
      max_transfers: Number(row.max_transfers !== undefined ? row.max_transfers : 3),
      max_budget_rupees: Number(row.max_budget_rupees !== undefined ? row.max_budget_rupees : 100),
      route_preference: row.route_preference || 'balanced',
      default_arrival_time: row.default_arrival_time || '09:00',
      allow_shared_rides: Boolean(row.allow_shared_rides !== undefined ? row.allow_shared_rides : 1),
      require_wheelchair_access: Boolean(row.require_wheelchair_access),
      default_origin_area: row.default_origin_area || '',
      default_destination_college: row.default_destination_college || '',
      created_at: Number(row.created_at || Date.now()),
      updated_at: Number(row.updated_at || Date.now())
    });
  }

  /**
   * Serializes entity into SQLite row format.
   * @returns {object}
   */
  toRow() {
    return {
      user_id: this.user_id,
      preferred_modes: JSON.stringify(this.preferred_modes),
      walking_tolerance_minutes: this.walking_tolerance_minutes,
      max_transfers: this.max_transfers,
      max_budget_rupees: this.max_budget_rupees,
      route_preference: this.route_preference,
      default_arrival_time: this.default_arrival_time,
      allow_shared_rides: this.allow_shared_rides ? 1 : 0,
      require_wheelchair_access: this.require_wheelchair_access ? 1 : 0,
      default_origin_area: this.default_origin_area,
      default_destination_college: this.default_destination_college,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Returns a sanitized, client-safe JSON representation.
   * @returns {object}
   */
  toJSON() {
    return {
      userId: this.user_id,
      preferredModes: [...this.preferred_modes],
      walkingToleranceMinutes: this.walking_tolerance_minutes,
      maxTransfers: this.max_transfers,
      maxBudgetRupees: this.max_budget_rupees,
      routePreference: this.route_preference,
      defaultArrivalTime: this.default_arrival_time,
      allowSharedRides: this.allow_shared_rides,
      requireWheelchairAccess: this.require_wheelchair_access,
      defaultOriginArea: this.default_origin_area,
      defaultDestinationCollege: this.default_destination_college,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

module.exports = {
  StudentCommutePreference,
  studentCommutePreferenceSchema,
  studentRoutePreferenceEnum
};
