/**
 * CommuteArea Domain Model & Safe Location Value Object
 *
 * Enforces area-level landmark abstractions for student commute planning.
 * Strictly prevents the storage or processing of:
 * - Exact residential street addresses
 * - House numbers, flat numbers, and building/apartment names
 * - Precise GPS coordinates and device location telemetry
 * - Postal PIN codes associated with granular addresses
 */

const { z } = require('zod');

// Regex detecting granular residential or building address patterns
const GRANULAR_ADDRESS_PATTERNS = [
  // Flat, Room, Apartment, Unit, Suite, Block, Building, Tower, Floor, Door, House, Kholi, Gala numbers
  /\b(flat|room|apt|apartment|unit|suite|block|bldg|building|tower|wing|floor|door|house|bungalow|chawl|kholi|gala)\s*(#|no\.?|number)?\s*(\d+|[a-z]\b)/i,
  // Housing society / residency / complex markers
  /\b(chs|c\.h\.s|c-h-s|society|residency|heights|enclave|paradise|apartments|vihar)\b/i,
  // Plot, Sector, Road number, Lane, Cross indicators
  /\b(plot\s*#?\s*\d+|sector\s*#?\s*\d+|road\s*no\.?\s*\d+|lane\s*#?\s*\d+|cross\s*#?\s*\d+)/i,
  // Raw GPS coordinates formatted as text (e.g. "19.0760, 72.8777" or "19.123456,72.845678")
  /^-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}$/,
  // Lat/Lon/GPS prefixes (e.g. "lat: 19.12, lon: 72.84")
  /\b(lat|latitude|lon|lng|longitude|coords?|gps)\s*[:=]\s*-?\d+/i,
  // 6-digit Mumbai PIN code (e.g., 400058, 401107) passed as location
  /\b(400\d{3}|401\d{3})\b/
];

/**
 * Validates whether a location string adheres to coarse area-level abstraction.
 * @param {string} val - Raw input location string
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkAreaGranularity(val) {
  if (!val || typeof val !== 'string') {
    return { valid: false, reason: 'Location area must be a non-empty string' };
  }

  const trimmed = val.trim();
  if (trimmed.length < 2) {
    return { valid: false, reason: 'Location area must be at least 2 characters long' };
  }
  if (trimmed.length > 100) {
    return { valid: false, reason: 'Location area cannot exceed 100 characters' };
  }

  for (const pattern of GRANULAR_ADDRESS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'Excessive location precision detected: Commute planning only accepts coarse area names or college landmarks (e.g. "Borivali West", "D.J. Sanghvi College"). Street addresses, flat numbers, building names, and GPS coordinates are strictly rejected to protect student privacy.'
      };
    }
  }

  return { valid: true };
}

/**
 * Classifies the type of coarse area/landmark.
 * @param {string} normalizedName
 * @returns {'COLLEGE'|'TRANSIT_HUB'|'LOCALITY'}
 */
function classifyAreaType(normalizedName) {
  const lower = normalizedName.toLowerCase();
  
  if (
    lower.includes('college') ||
    lower.includes('institute') ||
    lower.includes('campus') ||
    lower.includes('university') ||
    lower.includes('vjti') ||
    lower.includes('spit') ||
    lower.includes('nmims') ||
    lower.includes('mithibai') ||
    lower.includes('ruia') ||
    lower.includes('iit') ||
    lower.includes('sanghvi') ||
    lower.includes('bhavan') ||
    lower.includes('somaiya')
  ) {
    return 'COLLEGE';
  }

  if (
    lower.includes('station') ||
    lower.includes('railway') ||
    lower.includes('metro') ||
    lower.includes('terminus') ||
    lower.includes('depot') ||
    lower.includes('csmt') ||
    lower.includes('stn')
  ) {
    return 'TRANSIT_HUB';
  }

  return 'LOCALITY';
}

/**
 * Normalizes an area name into clean, sanitized Title Case.
 * @param {string} str
 * @returns {string}
 */
function sanitizeAreaName(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.,&'-]/gi, '')
    .split(' ')
    .map(word => {
      if (!word) return '';
      // Retain acronyms like CSMT, VJTI, SPIT, IIT
      if (word.length <= 4 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Zod schema for coarse area representation
const commuteAreaSchema = z.string().trim()
  .min(2, 'Location area must be at least 2 characters')
  .max(100, 'Location area cannot exceed 100 characters')
  .superRefine((val, ctx) => {
    const check = checkAreaGranularity(val);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.reason
      });
    }
  })
  .transform(val => sanitizeAreaName(val));

class CommuteArea {
  constructor(data) {
    const raw = typeof data === 'string' ? data : (data && (data.name || data.area));
    const validatedName = commuteAreaSchema.parse(raw);
    this.name = validatedName;
    this.areaType = (data && data.areaType) || classifyAreaType(validatedName);
    this.isCoarse = true;
  }

  static create(input) {
    return new CommuteArea(input);
  }

  static isSafe(input) {
    return checkAreaGranularity(input).valid;
  }

  toSafeLog() {
    return `[Area: "${this.name}" (${this.areaType})]`;
  }

  toJSON() {
    return {
      name: this.name,
      areaType: this.areaType,
      isCoarse: this.isCoarse
    };
  }
}

module.exports = {
  CommuteArea,
  commuteAreaSchema,
  checkAreaGranularity,
  classifyAreaType,
  sanitizeAreaName,
  GRANULAR_ADDRESS_PATTERNS
};
