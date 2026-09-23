const { z } = require('zod');
const { reportService } = require('../services');
const { ValidationError } = require('../errors');

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
    const reports = reportService.getLiveReports();
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
    const alerts = reportService.getAlerts();
    res.json({
      success: true,
      alerts
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

      const createdReport = reportService.createReport(parsed.data);

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

      const result = reportService.confirmReport(id, userToken);

      if (result.alreadyVoted) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      if (io && result.updatedReport) {
        io.emit('live_report_updated', result.updatedReport);
      }

      res.json({
        success: true,
        message: 'Confirmed that disruption is still happening',
        report: result.updatedReport
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

      const result = reportService.contradictReport(id, userToken);

      if (result.alreadyVoted) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      if (result.autoExpired) {
        if (io) {
          io.emit('live_report_expired', { id });
        }
      } else if (io && result.updatedReport) {
        io.emit('live_report_updated', result.updatedReport);
      }

      res.json({
        success: true,
        message: 'Recorded update that disruption cleared up',
        report: result.updatedReport
      });
    } catch (err) {
      next(err);
    }
  };
}

function getReport(req, res, next) {
  try {
    const { id } = req.params;
    const report = reportService.getReportById(id);
    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLiveReports,
  getReport,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport,
  reportSchema
};
