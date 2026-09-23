/**
 * Report Service
 *
 * Encapsulates business logic for crowdsourced transit disruption reports:
 * report ingestion, freshness weight calculation, voting logic, and alert formatting.
 */

const { reportRepository } = require('../repositories/ReportRepository');
const { getActiveReports, calculateFreshnessWeight } = require('./disruptionService');
const { NotFoundError } = require('../errors');

class ReportService {
  constructor(repo = reportRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves active, non-expired disruption reports with decay metrics, pagination and filtering.
   *
   * @param {object} [options={}]
   * @returns {{ reports: object[], count: number, pagination: object }}
   */
  getLiveReports(options = {}) {
    const result = this.repo.findWithPagination(options);
    const now = Date.now();
    const reportsWithMetrics = result.data.map(report => {
      const ageMinutes = Math.floor((now - report.created_at) / (1000 * 60));
      const freshnessWeight = calculateFreshnessWeight(report.created_at, now);
      return {
        ...(report.toRow ? report.toRow() : report),
        freshnessWeight,
        ageMinutes,
        ageFormatted: ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`
      };
    });

    return {
      reports: reportsWithMetrics,
      count: result.total,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1
      }
    };
  }

  /**
   * Finds a single disruption report by ID.
   *
   * @param {string} id
   * @returns {object}
   */
  getReportById(id) {
    const report = this.repo.findById(id);
    if (!report) {
      throw new NotFoundError(`Disruption report with id '${id}' not found`);
    }
    return report.toRow ? report.toRow() : report;
  }

  /**
   * Formats active disruption reports into high-priority student transit alerts.
   *
   * @returns {object[]}
   */
  getAlerts() {
    const res = this.getLiveReports({ limit: 10, status: 'active' });
    const reports = Array.isArray(res) ? res : (res.reports || []);
    return reports.map(r => ({
      id: r.id,
      title: `⚠ ${r.area} (${r.mode.toUpperCase()})`,
      message: r.message,
      impact: r.impact,
      age: r.ageFormatted,
      confirmations: r.confirmation_count
    }));
  }

  /**
   * Ingests and persists a new community disruption report.
   *
   * @param {object} input
   * @returns {object} Created report with initial freshness metadata
   */
  createReport(input) {
    const {
      pseudonym,
      area,
      route_name,
      route_id,
      mode,
      message,
      impact,
      durationObservedMinutes
    } = input;

    const now = Date.now();
    const duration = durationObservedMinutes || 60;
    const expiresAt = now + duration * 60 * 1000;
    const reportId = input.id || `rep-${now}-${Math.random().toString(36).substring(2, 6)}`;

    const created = this.repo.create({
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

    const reportRow = created ? (created.toRow ? created.toRow() : created) : {
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

    return {
      ...reportRow,
      freshnessWeight: 1.0,
      ageMinutes: 0,
      ageFormatted: 'Just now'
    };
  }

  /**
   * Records a confirmation ("Still happening") vote for a disruption report.
   *
   * @param {string} id
   * @param {string} userToken
   * @returns {{ updatedReport: object|null, alreadyVoted: boolean }}
   */
  confirmReport(id, userToken) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Disruption report with id '${id}' not found`);
    }

    const result = this.repo.addVote(id, userToken, 'confirm');
    const updatedRow = result.updatedReport
      ? (result.updatedReport.toRow ? result.updatedReport.toRow() : result.updatedReport)
      : null;

    return {
      updatedReport: updatedRow,
      alreadyVoted: result.alreadyVoted
    };
  }

  /**
   * Records a contradiction ("No longer happening") vote for a disruption report.
   *
   * @param {string} id
   * @param {string} userToken
   * @returns {{ updatedReport: object|null, alreadyVoted: boolean, autoExpired: boolean }}
   */
  contradictReport(id, userToken) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Disruption report with id '${id}' not found`);
    }

    const result = this.repo.addVote(id, userToken, 'contradict');
    const updatedRow = result.updatedReport
      ? (result.updatedReport.toRow ? result.updatedReport.toRow() : result.updatedReport)
      : null;

    return {
      updatedReport: updatedRow,
      alreadyVoted: result.alreadyVoted,
      autoExpired: Boolean(result.autoExpired)
    };
  }

  /**
   * Updates an existing disruption report.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {object}
   */
  updateReport(id, updates) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Disruption report with id '${id}' not found`);
    }

    const updated = this.repo.update(id, updates);
    return updated.toRow ? updated.toRow() : updated;
  }

  /**
   * Deletes an existing disruption report and its vote records.
   *
   * @param {string} id
   * @returns {boolean}
   */
  deleteReport(id) {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Disruption report with id '${id}' not found`);
    }

    return this.repo.delete(id);
  }
}

module.exports = {
  ReportService,
  reportService: new ReportService()
};
