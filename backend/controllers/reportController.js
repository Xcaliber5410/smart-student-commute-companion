const { z } = require('zod');
const { reportService } = require('../services');
const { ValidationError } = require('../errors');
const { success, created, paginated } = require('../utils/apiResponse');

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
    const result = reportService.getLiveReports(req.query);
    return paginated(res, {
      dataKey: 'reports',
      data: result.reports,
      count: result.count,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
}

function getAlerts(req, res, next) {
  try {
    const alerts = reportService.getAlerts();
    return success(res, { alerts });
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

      if (io) {
        io.emit('live_report_created', createdReport);
      }

      return created(res, {
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
        return success(res, { message: 'Vote already recorded', alreadyVoted: true });
      }

      if (io && result.updatedReport) {
        io.emit('live_report_updated', result.updatedReport);
      }

      return success(res, {
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
        return success(res, { message: 'Vote already recorded', alreadyVoted: true });
      }

      if (result.autoExpired) {
        if (io) {
          io.emit('live_report_expired', { id });
        }
      } else if (io && result.updatedReport) {
        io.emit('live_report_updated', result.updatedReport);
      }

      return success(res, {
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
    return success(res, { report });
  } catch (err) {
    next(err);
  }
}

function updateReport(io) {
  const handler = (req, res, next) => {
    try {
      const { id } = req.params;
      const updated = reportService.updateReport(id, req.body, req.user);
      if (io && typeof io.emit === 'function') {
        io.emit('live_report_updated', updated);
      }
      return success(res, {
        message: 'Report updated successfully',
        report: updated
      });
    } catch (err) {
      next(err);
    }
  };

  if (io && io.headers && typeof io.headers === 'object') {
    return handler(io, arguments[1], arguments[2]);
  }
  return handler;
}

function deleteReport(io) {
  const handler = (req, res, next) => {
    try {
      const { id } = req.params;
      reportService.deleteReport(id, req.user);
      if (io && typeof io.emit === 'function') {
        io.emit('live_report_deleted', { id });
      }
      return success(res, {
        message: 'Report deleted successfully',
        id
      });
    } catch (err) {
      next(err);
    }
  };

  if (io && io.headers && typeof io.headers === 'object') {
    return handler(io, arguments[1], arguments[2]);
  }
  return handler;
}

module.exports = {
  getLiveReports,
  getReport,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport,
  updateReport,
  deleteReport,
  reportSchema
};
