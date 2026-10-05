/**
 * CommutePlanInputDTO & Privacy-Safe Commute Input Representation
 *
 * Implements the domain Data Transfer Object (DTO) for student commute planning requests.
 * Enforces strict privacy-by-design principles:
 * - Uses coarse area-level / landmark abstractions (CommuteArea)
 * - Prohibits exact personal location history, GPS tracking, and home addresses
 * - Rejects sensitive tracking, device identifiers, and residential address fields
 * - Validates transport mode preferences, 24h arrival times, and commute constraints
 * - Provides privacy-safe logging sanitization (zero coordinate/PII exposure)
 */

const { z } = require('zod');
const { CommuteArea, commuteAreaSchema } = require('./CommuteArea');
const {
  TRANSPORT_MODES,
  ROUTE_PREFERENCES,
  transportModeEnum,
  routePreferenceEnum,
  CommuteConstraint,
  commuteConstraintSchema
} = require('./CommuteContracts');

/**
 * List of forbidden privacy-invasive or tracking fields.
 * If present in the request body, validation immediately rejects to prevent accidental PII leakage.
 */
const FORBIDDEN_PRIVACY_FIELDS = Object.freeze([
  'homeAddress',
  'home_address',
  'residentialAddress',
  'residential_address',
  'streetAddress',
  'street_address',
  'exactLocation',
  'exact_location',
  'preciseLocation',
  'precise_location',
  'coordinates',
  'coords',
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'gps',
  'tracking',
  'currentLocation',
  'current_location',
  'liveLocation',
  'live_location',
  'deviceId',
  'device_id',
  'imei',
  'macAddress',
  'mac_address',
  'ipAddress',
  'ip_address',
  'phoneNumber',
  'phone',
  'email'
]);

/**
 * Checks an object for the presence of forbidden privacy-invasive fields.
 * @param {object} obj
 * @returns {string[]} Array of detected forbidden field names
 */
function findForbiddenPrivacyFields(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const detected = [];
  for (const field of FORBIDDEN_PRIVACY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== undefined) {
      detected.push(field);
    }
  }
  return detected;
}

// Strict 24-hour time regex: HH:MM from 00:00 to 23:59
const strict24hTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Core Zod schema for privacy-safe commute planning input.
 */
const privacySafeCommuteInputSchema = z.object({
  // Starting area (accepts 'startingArea' or 'origin')
  startingArea: commuteAreaSchema.optional(),
  origin: commuteAreaSchema.optional(),

  // College destination (accepts 'collegeDestination' or 'destination')
  collegeDestination: commuteAreaSchema.optional(),
  destination: commuteAreaSchema.optional(),

  // Desired arrival time
  desiredArrivalTime: z.string().trim()
    .regex(strict24hTimeRegex, 'Desired arrival time must be in 24-hour HH:MM format (e.g. "09:00", "14:30")')
    .default('09:00'),

  // Desired departure time (optional)
  desiredDepartureTime: z.string().trim()
    .regex(strict24hTimeRegex, 'Desired departure time must be in 24-hour HH:MM format')
    .optional(),

  // Preferred transport modes
  preferredModes: z.array(transportModeEnum)
    .min(1, 'At least one transport mode must be selected')
    .default([
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.WALK
    ])
    .transform(modes => Array.from(new Set(modes))),

  // Commute constraints
  preference: routePreferenceEnum.default(ROUTE_PREFERENCES.BALANCED),
  walkingToleranceMinutes: z.coerce.number().int()
    .min(5, 'Walking tolerance must be at least 5 minutes')
    .max(60, 'Walking tolerance cannot exceed 60 minutes')
    .default(20),
  maxBudgetRupees: z.coerce.number()
    .min(0, 'Budget cannot be negative')
    .max(2000, 'Budget cannot exceed ₹2000')
    .default(100),
  maxTransfers: z.coerce.number().int()
    .min(0, 'Transfers cannot be negative')
    .max(5, 'Transfers cannot exceed 5')
    .default(3),
  allowSharedRides: z.boolean().default(true),
  requireWheelchairAccess: z.boolean().default(false),
  useSchedule: z.boolean().default(false)
}).superRefine((data, ctx) => {
  // 1. Resolve starting area
  const resolvedOrigin = data.startingArea || data.origin;
  if (!resolvedOrigin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startingArea'],
      message: 'Starting area or origin landmark is required (e.g. "Borivali West", "Andheri Station")'
    });
  }

  // 2. Resolve college destination
  const resolvedDest = data.collegeDestination || data.destination;
  if (!resolvedDest) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['collegeDestination'],
      message: 'College destination is required (e.g. "D.J. Sanghvi College", "VJTI College")'
    });
  }

  // 3. Ensure starting area and destination are not identical
  if (resolvedOrigin && resolvedDest && resolvedOrigin.toLowerCase() === resolvedDest.toLowerCase()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['collegeDestination'],
      message: 'College destination cannot be identical to the starting area'
    });
  }
});

class CommutePlanInputDTO {
  /**
   * @param {object} rawInput
   */
  constructor(rawInput) {
    // 1. Strict check for forbidden privacy fields before parsing
    const forbidden = findForbiddenPrivacyFields(rawInput);
    if (forbidden.length > 0) {
      const err = new Error(
        `Privacy violation: Request contains prohibited field(s): ${forbidden.join(', ')}. Commute Companion does not accept or store precise location history, GPS tracking data, home addresses, or device identifiers.`
      );
      err.statusCode = 400;
      err.code = 'PRIVACY_VIOLATION';
      err.prohibitedFields = forbidden;
      throw err;
    }

    // 2. Validate against schema
    const validated = privacySafeCommuteInputSchema.parse(rawInput);

    // 3. Populate DTO fields
    const startingName = validated.startingArea || validated.origin;
    const destName = validated.collegeDestination || validated.destination;

    this.startingArea = new CommuteArea(startingName);
    this.collegeDestination = new CommuteArea(destName);
    this.desiredArrivalTime = validated.desiredArrivalTime;
    this.desiredDepartureTime = validated.desiredDepartureTime || null;
    this.preferredModes = validated.preferredModes;
    this.preference = validated.preference;
    this.walkingToleranceMinutes = validated.walkingToleranceMinutes;
    this.maxBudgetRupees = validated.maxBudgetRupees;
    this.maxTransfers = validated.maxTransfers;
    this.allowSharedRides = validated.allowSharedRides;
    this.requireWheelchairAccess = validated.requireWheelchairAccess;
    this.useSchedule = validated.useSchedule;
  }

  /**
   * Factory method to create a validated DTO from raw request body.
   * @param {object} reqBody
   * @returns {CommutePlanInputDTO}
   */
  static fromRequest(reqBody) {
    return new CommutePlanInputDTO(reqBody);
  }

  /**
   * Converts the DTO's constraints into a domain CommuteConstraint object.
   * @returns {CommuteConstraint}
   */
  toConstraint() {
    return new CommuteConstraint({
      maxBudgetRupees: this.maxBudgetRupees,
      walkingToleranceMinutes: this.walkingToleranceMinutes,
      preferredModes: this.preferredModes,
      preference: this.preference,
      maxTransfers: this.maxTransfers,
      desiredArrivalTime: this.desiredArrivalTime,
      requireWheelchairAccess: this.requireWheelchairAccess,
      allowSharedRides: this.allowSharedRides
    });
  }

  /**
   * Produces an ephemeral parameter bundle for the routing engine.
   * Contains zero persistent IDs or PII.
   * @returns {object}
   */
  toEphemeralRoutingParams() {
    return {
      origin: this.startingArea.name,
      destination: this.collegeDestination.name,
      desiredArrivalTime: this.desiredArrivalTime,
      desiredDepartureTime: this.desiredDepartureTime,
      preferredModes: [...this.preferredModes],
      preference: this.preference,
      walkingToleranceMinutes: this.walkingToleranceMinutes,
      maxBudgetRupees: this.maxBudgetRupees,
      maxTransfers: this.maxTransfers,
      allowSharedRides: this.allowSharedRides,
      useSchedule: this.useSchedule
    };
  }

  /**
   * Sanitizes any raw input object for safe logging.
   * Strips all potential PII, coordinates, and headers.
   * @param {object} input
   * @returns {object} Safe log-friendly dictionary
   */
  static sanitizeForLog(input) {
    if (!input || typeof input !== 'object') return { log: 'empty_input' };
    const safe = {
      startingArea: input.startingArea || input.origin ? String(input.startingArea || input.origin).trim().substring(0, 50) : undefined,
      collegeDestination: input.collegeDestination || input.destination ? String(input.collegeDestination || input.destination).trim().substring(0, 50) : undefined,
      desiredArrivalTime: input.desiredArrivalTime,
      preferredModes: Array.isArray(input.preferredModes) ? input.preferredModes : undefined,
      preference: input.preference,
      maxBudgetRupees: input.maxBudgetRupees
    };

    // Remove any undefined keys
    Object.keys(safe).forEach(k => safe[k] === undefined && delete safe[k]);
    return safe;
  }

  /**
   * Formats a clean, redacted one-line string suitable for production audit logs.
   * @returns {string}
   */
  toSafeLog() {
    return `[CommutePlan] from="${this.startingArea.name}" to="${this.collegeDestination.name}" modes=[${this.preferredModes.join(',')}] arrival=${this.desiredArrivalTime} budget=₹${this.maxBudgetRupees}`;
  }

  toJSON() {
    return {
      startingArea: this.startingArea.toJSON(),
      collegeDestination: this.collegeDestination.toJSON(),
      desiredArrivalTime: this.desiredArrivalTime,
      desiredDepartureTime: this.desiredDepartureTime,
      preferredModes: [...this.preferredModes],
      preference: this.preference,
      walkingToleranceMinutes: this.walkingToleranceMinutes,
      maxBudgetRupees: this.maxBudgetRupees,
      maxTransfers: this.maxTransfers,
      allowSharedRides: this.allowSharedRides,
      requireWheelchairAccess: this.requireWheelchairAccess,
      useSchedule: this.useSchedule
    };
  }
}

module.exports = {
  CommutePlanInputDTO,
  privacySafeCommuteInputSchema,
  FORBIDDEN_PRIVACY_FIELDS,
  findForbiddenPrivacyFields,
  strict24hTimeRegex
};
