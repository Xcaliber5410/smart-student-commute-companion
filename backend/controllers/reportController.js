const { z } = require('zod');
const { db } = require('../db/database');
const { getActiveReports } = require('../services/disruptionService');

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

function getLiveReports(req, res) {
  try {
    const reports = getActiveReports();
    res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getAlerts(req, res) {
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
    res.status(500).json({ error: err.message });
  }
}

function createReport(io) {
  return (req, res) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const { pseudonym, area, route_name, route_id, mode, message, impact, durationObservedMinutes } = parsed.data;
      const now = Date.now();
      const expiresAt = now + (durationObservedMinutes || 60) * 60 * 1000;
      const reportId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const stmt = db.prepare(`
        INSERT INTO live_commute_reports 
        (id, pseudonym, area, route_name, route_id, mode, message, impact, status, created_at, expires_at, confirmation_count, contradiction_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 1, 0)
      `);

      stmt.run(reportId, pseudonym, area, route_name, route_id, mode, message, impact, now, expiresAt);

      const createdReport = {
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
        contradiction_count: 0,
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
      console.error('Create report error:', err);
      res.status(500).json({ error: err.message });
    }
  };
}

function confirmReport(io) {
  return (req, res) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      // Record confirmation vote if not already voted
      const checkStmt = db.prepare('SELECT * FROM live_report_confirmations WHERE report_id = ? AND user_token = ?');
      const existing = checkStmt.get(id, userToken);

      if (existing) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      db.prepare('INSERT INTO live_report_confirmations (report_id, user_token, action, created_at) VALUES (?, ?, ?, ?)')
        .run(id, userToken, 'confirm', Date.now());

      db.prepare('UPDATE live_commute_reports SET confirmation_count = confirmation_count + 1 WHERE id = ?').run(id);

      const updatedReport = db.prepare('SELECT * FROM live_commute_reports WHERE id = ?').get(id);

      if (io) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Confirmed that disruption is still happening',
        report: updatedReport
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

function contradictReport(io) {
  return (req, res) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      const checkStmt = db.prepare('SELECT * FROM live_report_confirmations WHERE report_id = ? AND user_token = ?');
      const existing = checkStmt.get(id, userToken);

      if (existing) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      db.prepare('INSERT INTO live_report_confirmations (report_id, user_token, action, created_at) VALUES (?, ?, ?, ?)')
        .run(id, userToken, 'contradict', Date.now());

      db.prepare('UPDATE live_commute_reports SET contradiction_count = contradiction_count + 1 WHERE id = ?').run(id);

      const updatedReport = db.prepare('SELECT * FROM live_commute_reports WHERE id = ?').get(id);

      // If contradictions significantly outnumber confirmations, auto-expire
      if (updatedReport.contradiction_count >= updatedReport.confirmation_count + 3) {
        db.prepare("UPDATE live_commute_reports SET status = 'expired' WHERE id = ?").run(id);
        if (io) {
          io.emit('live_report_expired', { id });
        }
      } else if (io) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Recorded update that disruption cleared up',
        report: updatedReport
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
