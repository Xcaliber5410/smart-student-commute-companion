/**
 * WorkloadAnalysisService
 *
 * Deterministic analysis service for student schedule workload and time block conflicts.
 * Computes daily/weekly commitments, overloaded days, deadline concentrations, and overlapping intervals.
 */

const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { getConnection } = require('../db/connection');
const { Assignment } = require('../models/Assignment');
const { getMumbaiNow, IST_OFFSET_MS, formatInMumbaiTime } = require('../utils/timezone');
const { ValidationError } = require('../errors');

class WorkloadAnalysisService {
  constructor(
    eventRepo = calendarEventRepository,
    studyRepo = studySessionRepository,
    asgnRepo = assignmentRepository,
    dbInstance = null
  ) {
    this.eventRepo = eventRepo;
    this.studyRepo = studyRepo;
    this.asgnRepo = asgnRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Helper to format an epoch ms timestamp into 'YYYY-MM-DD' in Asia/Kolkata timezone.
   */
  getDateKeyIST(epochMs) {
    const ist = new Date(epochMs + IST_OFFSET_MS);
    const yyyy = ist.getUTCFullYear();
    const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ist.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Detects overlapping time intervals between calendar events and study sessions.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { start, end, days = 14 }
   * @returns {object} Conflict detection report
   */
  async analyzeConflicts(userId, options = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    const now = Date.now();
    const start = options.start ? Number(options.start) : now;
    const end = options.end ? Number(options.end) : start + ((Number(options.days) || 14) * 86400000);

    if (start >= end) {
      throw new ValidationError('start timestamp must be strictly before end timestamp');
    }

    // 1. Fetch active events & study sessions in range
    const events = this.eventRepo.findInRange(userId, start, end, { status: 'scheduled' });
    const studySessions = this.studyRepo.findInRange(userId, start, end, { status: 'planned' });

    // 2. Normalize into time blocks
    const blocks = [];

    for (const e of events) {
      blocks.push({
        id: e.id,
        type: 'calendar_event',
        title: e.title,
        startTime: e.start_time,
        endTime: e.end_time,
        durationMinutes: e.durationMinutes,
        location: e.location,
        courseId: e.course_id
      });
    }

    for (const s of studySessions) {
      blocks.push({
        id: s.id,
        type: 'study_session',
        title: s.title,
        startTime: s.planned_start_time,
        endTime: s.plannedEndTime,
        durationMinutes: s.planned_duration_minutes,
        courseId: s.course_id,
        assignmentId: s.assignment_id
      });
    }

    // 3. Find pairwise overlaps [A.start < B.end AND B.start < A.end]
    const conflicts = [];
    const seenPairs = new Set();

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];

        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          const pairKey = [a.id, b.id].sort().join(':');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          const overlapStart = Math.max(a.startTime, b.startTime);
          const overlapEnd = Math.min(a.endTime, b.endTime);
          const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

          let severity = 'medium';
          if (overlapMinutes >= 30 || a.startTime === b.startTime) {
            severity = 'high';
          }

          conflicts.push({
            conflictId: `cnf-${overlapStart}-${Math.random().toString(36).substring(2, 6)}`,
            severity,
            overlapMinutes,
            overlapWindow: {
              start: overlapStart,
              end: overlapEnd
            },
            firstItem: a,
            secondItem: b
          });
        }
      }
    }

    return {
      range: { start, end, days: Math.round((end - start) / 86400000) },
      hasConflicts: conflicts.length > 0,
      totalConflicts: conflicts.length,
      conflicts
    };
  }

  /**
   * Generates comprehensive workload metrics, daily commitment summaries, and overload warnings.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { start, end, days = 7 }
   * @returns {object} Workload summary
   */
  async getWorkloadSummary(userId, options = {}) {
    if (!userId) {
      throw new ValidationError('Student user ID is required');
    }

    const now = Date.now();
    const start = options.start ? Number(options.start) : now;
    const end = options.end ? Number(options.end) : start + ((Number(options.days) || 7) * 86400000);

    if (start >= end) {
      throw new ValidationError('start timestamp must be strictly before end timestamp');
    }

    // 1. Fetch data in window
    const events = this.eventRepo.findInRange(userId, start, end, { status: 'scheduled' });
    const studySessions = this.studyRepo.findInRange(userId, start, end);

    const asgnStmt = this.database.prepare(`
      SELECT * FROM assignments 
      WHERE user_id = ? 
        AND due_date >= ? 
        AND due_date <= ? 
        AND status != 'cancelled'
      ORDER BY due_date ASC
    `);
    const asgnRows = asgnStmt.all(userId, start, end);
    const assignments = asgnRows.map(r => Assignment.fromRow(r));

    // 2. Initialize day map across entire date span
    const dailyMap = new Map();
    const cursor = new Date(start);
    const endDate = new Date(end);

    while (cursor <= endDate) {
      const dateKey = this.getDateKeyIST(cursor.getTime());
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          eventsCount: 0,
          eventMinutes: 0,
          studySessionsCount: 0,
          plannedStudyMinutes: 0,
          assignmentsDueCount: 0,
          totalCommitmentMinutes: 0,
          isHeavyDay: false,
          loadLevel: 'light'
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // 3. Populate daily aggregates
    for (const e of events) {
      const dateKey = this.getDateKeyIST(e.start_time);
      if (dailyMap.has(dateKey)) {
        const day = dailyMap.get(dateKey);
        day.eventsCount++;
        day.eventMinutes += e.durationMinutes;
      }
    }

    for (const s of studySessions) {
      const dateKey = this.getDateKeyIST(s.planned_start_time);
      if (dailyMap.has(dateKey)) {
        const day = dailyMap.get(dateKey);
        day.studySessionsCount++;
        day.plannedStudyMinutes += s.planned_duration_minutes;
      }
    }

    for (const a of assignments) {
      const dateKey = this.getDateKeyIST(a.due_date);
      if (dailyMap.has(dateKey)) {
        const day = dailyMap.get(dateKey);
        day.assignmentsDueCount++;
      }
    }

    // 4. Compute metrics and overload status per day
    let heavyDaysCount = 0;
    let busiestDay = null;
    let maxCommitment = -1;

    const dailyBreakdown = Array.from(dailyMap.values()).map(day => {
      day.totalCommitmentMinutes = day.eventMinutes + day.plannedStudyMinutes;

      // Heavy day threshold: >= 240 minutes (4 hours) of scheduled blocks OR >= 2 assignment deadlines
      day.isHeavyDay = day.totalCommitmentMinutes >= 240 || day.assignmentsDueCount >= 2;

      if (day.totalCommitmentMinutes >= 240) {
        day.loadLevel = 'heavy';
      } else if (day.totalCommitmentMinutes >= 120) {
        day.loadLevel = 'moderate';
      } else {
        day.loadLevel = 'light';
      }

      if (day.isHeavyDay) {
        heavyDaysCount++;
      }

      if (day.totalCommitmentMinutes > maxCommitment) {
        maxCommitment = day.totalCommitmentMinutes;
        busiestDay = day.date;
      }

      return day;
    });

    // 5. Total aggregations
    const totalEvents = events.length;
    const totalStudySessions = studySessions.length;
    const totalPlannedStudyMinutes = studySessions.reduce((acc, s) => acc + s.planned_duration_minutes, 0);
    const totalAssignmentsDue = assignments.length;

    // Check conflicts in the same period
    const conflictResult = await this.analyzeConflicts(userId, { start, end });

    return {
      period: {
        start,
        end,
        days: dailyBreakdown.length
      },
      summary: {
        totalEvents,
        totalStudySessions,
        totalPlannedStudyMinutes,
        totalPlannedStudyHours: Number((totalPlannedStudyMinutes / 60).toFixed(1)),
        totalAssignmentsDue,
        heavyDaysCount,
        busiestDay,
        conflictsCount: conflictResult.totalConflicts
      },
      dailyBreakdown,
      hasConflicts: conflictResult.hasConflicts,
      conflicts: conflictResult.conflicts
    };
  }
}

module.exports = {
  WorkloadAnalysisService,
  workloadAnalysisService: new WorkloadAnalysisService()
};
