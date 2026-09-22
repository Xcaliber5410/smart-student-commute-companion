const { z } = require('zod');
const { reportRepository } = require('../repositories');
const { getActiveReports } = require('../services/disruptionService');
const { ValidationError, NotFoundError } = require('../errors');

const reportSchema = z.object({
  pseudonym: z.string().min(2).max(30).optional().default('Student_Rider'),
  area: z.string().min(2),
  route_name: z.string().optional().default('General Corridor'),
  route_id: z.string().optional().default(''),
  mode: z.enum(['train', 'metro', 'bus', 'auto', 'walk']),
  message: z.string().min(5).max(250),
  impact: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  durationObservedMinutes: z.number().optional().default(60)
});

function getLiveReports(req, res, next) {
  try {
    const reports = getActiveReports();
    res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (err) {
    next(err);
  }
}

function getAlerts(req, res, next) {
  try {
    const reports = getActiveReports();
    res.json({
      success: true,
      alerts: reports.map(r => ({
        id: r.id,
        title: `⚠ ${r.area} (${r.mode.toUpperCase()})`,
        message: r.message,
        impact: r.impact,
        age: r.ageFormatted,
        confirmations: r.confirmation_count
      }))
    });
  } catch (err) {
    next(err);
  }
}

function createReport(io) {
  return (req, res, next) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError('Validation failed', parsed.error.format()));
      }

      const { pseudonym, area, route_name, route_id, mode, message, impact, durationObservedMinutes } = parsed.data;
      const now = Date.now();
      const expiresAt = now + (durationObservedMinutes || 60) * 60 * 1000;
      const reportId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const created = reportRepository.create({
        id: reportId,
        pseudonym,
        area,
        route_name,
        route_id,
        mode,
        message,
        impact,
        status: 'active',
        created_at: now,
        expires_at: expiresAt,
        confirmation_count: 1,
        contradiction_count: 0
      });

      const reportRow = created ? created.toRow() : {
        id: reportId,
        pseudonym,
        area,
        route_name,
        route_id,
        mode,
        message,
        impact,
        status: 'active',
        created_at: now,
        expires_at: expiresAt,
        confirmation_count: 1,
        contradiction_count: 0
      };

      const createdReport = {
        ...reportRow,
        freshnessWeight: 1.0,
        ageMinutes: 0,
        ageFormatted: 'Just now'
      };

      // Broadcast to connected students via Socket.IO
      if (io) {
        io.emit('live_report_created', createdReport);
      }

      res.status(201).json({
        success: true,
        message: 'Community report posted successfully',
        report: createdReport
      });
    } catch (err) {
      next(err);
    }
  };
}

function confirmReport(io) {
  return (req, res, next) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      const result = reportRepository.addVote(id, userToken, 'confirm');

      if (result.alreadyVoted) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      const updatedReport = result.updatedReport ? result.updatedReport.toRow() : null;

      if (io && updatedReport) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Confirmed that disruption is still happening',
        report: updatedReport
      });
    } catch (err) {
      next(err);
    }
  };
}

function contradictReport(io) {
  return (req, res, next) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      const result = reportRepository.addVote(id, userToken, 'contradict');

      if (result.alreadyVoted) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      const updatedReport = result.updatedReport ? result.updatedReport.toRow() : null;

      if (result.autoExpired) {
        if (io) {
          io.emit('live_report_expired', { id });
        }
      } else if (io && updatedReport) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Recorded update that disruption cleared up',
        report: updatedReport
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  getLiveReports,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport,
  reportSchema
};
