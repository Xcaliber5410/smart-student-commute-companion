/**
 * Calendar Range & Upcoming Schedule Controller
 */

const { calendarRangeService } = require('../services/calendarRangeService');
const { success } = require('../utils/apiResponse');

async function getScheduleInRange(req, res, next) {
  try {
    const { start, end } = req.query;
    const schedule = await calendarRangeService.getScheduleInRange(req.user.id, start, end);
    return success(res, {
      message: 'Calendar range schedule retrieved successfully',
      ...schedule
    });
  } catch (err) {
    next(err);
  }
}

async function getTodaySchedule(req, res, next) {
  try {
    const schedule = await calendarRangeService.getTodaySchedule(req.user.id);
    return success(res, {
      message: "Today's schedule retrieved successfully",
      ...schedule
    });
  } catch (err) {
    next(err);
  }
}

async function getUpcomingSchedule(req, res, next) {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    const schedule = await calendarRangeService.getUpcomingSchedule(req.user.id, days);
    return success(res, {
      message: 'Upcoming schedule retrieved successfully',
      ...schedule
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getScheduleInRange,
  getTodaySchedule,
  getUpcomingSchedule
};
