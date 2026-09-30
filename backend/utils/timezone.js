/**
 * Timezone Utility for Mumbai Transit Network (Asia/Kolkata / IST UTC+05:30)
 *
 * Ensures all scheduling, day-of-week determinations, and time-of-day calculations
 * are strictly timezone-safe regardless of the server's native system clock (e.g. UTC).
 */

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30 in milliseconds

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns current Date in IST.
 */
function getMumbaiNow(baseDate = new Date()) {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60000;
  return new Date(utcTime + IST_OFFSET_MS);
}

/**
 * Returns the 3-letter day of the week ('Mon', 'Tue', ...) in Asia/Kolkata.
 */
function getMumbaiDayOfWeek(baseDate = new Date()) {
  const d = getMumbaiNow(baseDate);
  return DAYS_OF_WEEK[d.getDay()];
}

/**
 * Returns the current time in 'HH:MM' (24-hour format) in Asia/Kolkata.
 */
function getMumbaiTimeHHMM(baseDate = new Date()) {
  const d = getMumbaiNow(baseDate);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Converts a Mumbai local 'HH:MM' string on a given date into a UTC epoch millisecond timestamp.
 *
 * @param {string} timeHHMM - e.g. '08:45'
 * @param {Date} [baseDate=new Date()]
 * @returns {number} UTC epoch milliseconds
 */
function parseMumbaiTimeToEpoch(timeHHMM, baseDate = new Date()) {
  if (!timeHHMM || typeof timeHHMM !== 'string') {
    throw new Error('Valid time string in HH:MM format is required');
  }

  const [hoursStr, minutesStr] = timeHHMM.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time format: '${timeHHMM}'. Expected 'HH:MM' (00:00 - 23:59)`);
  }

  const istNow = getMumbaiNow(baseDate);
  const year = istNow.getFullYear();
  const month = istNow.getMonth();
  const day = istNow.getDate();

  // Create date representing YYYY-MM-DD HH:MM:00 in UTC, then subtract +05:30 offset
  const utcMillis = Date.UTC(year, month, day, hours, minutes, 0, 0) - IST_OFFSET_MS;
  return utcMillis;
}

/**
 * Formats a UTC epoch millisecond timestamp into a human-readable IST string.
 */
function formatInMumbaiTime(epochMs) {
  const date = new Date(epochMs);
  return date.toLocaleString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Returns UTC millisecond timestamps for start of day (00:00:00) and end of day (23:59:59.999) in IST.
 */
function getMumbaiTodayRange(baseDate = new Date()) {
  const istNow = getMumbaiNow(baseDate);
  const year = istNow.getFullYear();
  const month = istNow.getMonth();
  const day = istNow.getDate();

  const startOfDay = Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const endOfDay = startOfDay + (24 * 3600 * 1000) - 1;
  return { startOfDay, endOfDay };
}

module.exports = {
  DEFAULT_TIMEZONE,
  IST_OFFSET_MS,
  DAYS_OF_WEEK,
  getMumbaiNow,
  getMumbaiDayOfWeek,
  getMumbaiTimeHHMM,
  parseMumbaiTimeToEpoch,
  formatInMumbaiTime,
  getMumbaiTodayRange
};
