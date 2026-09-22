/**
 * Report Repository
 *
 * Data-access operations for Live Commute Reports and Confirmation/Contradiction votes.
 */

const { getConnection } = require('../db/connection');
const { LiveReport } = require('../models/LiveReport');
const { ReportConfirmation } = require('../models/ReportConfirmation');

class ReportRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Retrieves all non-expired active disruption reports.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {LiveReport[]}
   */
  findActive(currentTime = Date.now()) {
    const stmt = this.database.prepare(`
      SELECT * FROM live_commute_reports 
      WHERE status = 'active' AND expires_at > ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(currentTime);
    return rows.map(r => LiveReport.fromRow(r));
  }

  /**
   * Finds a live report by its ID.
   *
   * @param {string} id
   * @returns {LiveReport|null}
   */
  findById(id) {
    const stmt = this.database.prepare('SELECT * FROM live_commute_reports WHERE id = ?');
    const row = stmt.get(id);
    return row ? LiveReport.fromRow(row) : null;
  }

  /**
   * Persists a new live report.
   *
   * @param {object|LiveReport} data
   * @returns {LiveReport}
   */
  create(data) {
    const report = data instanceof LiveReport ? data : LiveReport.create(data);
    const row = report.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO live_commute_reports 
      (id, pseudonym, area, route_name, route_id, mode, message, impact, status, created_at, expires_at, confirmation_count, contradiction_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.pseudonym,
      row.area,
      row.route_name,
      row.route_id,
      row.mode,
      row.message,
      row.impact,
      row.status,
      row.created_at,
      row.expires_at,
      row.confirmation_count,
      row.contradiction_count
    );

    return this.findById(row.id);
  }

  /**
   * Finds an existing vote by report ID and user token.
   *
   * @param {string} reportId
   * @param {string} userToken
   * @returns {ReportConfirmation|null}
   */
  findVote(reportId, userToken) {
    const stmt = this.database.prepare(
      'SELECT * FROM live_report_confirmations WHERE report_id = ? AND user_token = ?'
    );
    const row = stmt.get(reportId, userToken);
    return row ? ReportConfirmation.fromRow(row) : null;
  }

  /**
   * Records a confirmation or contradiction vote on a report inside a transaction.
   * Auto-expires report if contradictions significantly outweigh confirmations.
   *
   * @param {string} reportId
   * @param {string} userToken
   * @param {'confirm'|'contradict'} action
   * @returns {{ updatedReport: LiveReport, alreadyVoted: boolean, autoExpired: boolean }}
   */
  addVote(reportId, userToken, action) {
    const existing = this.findVote(reportId, userToken);
    if (existing) {
      const currentReport = this.findById(reportId);
      return { updatedReport: currentReport, alreadyVoted: true, autoExpired: false };
    }

    let autoExpired = false;

    const executeTransaction = this.database.transaction(() => {
      // 1. Record confirmation vote
      const voteStmt = this.database.prepare(`
        INSERT INTO live_report_confirmations (report_id, user_token, action, created_at)
        VALUES (?, ?, ?, ?)
      `);
      voteStmt.run(reportId, userToken, action, Date.now());

      // 2. Increment appropriate counter
      if (action === 'confirm') {
        this.database.prepare(
          'UPDATE live_commute_reports SET confirmation_count = confirmation_count + 1 WHERE id = ?'
        ).run(reportId);
      } else {
        this.database.prepare(
          'UPDATE live_commute_reports SET contradiction_count = contradiction_count + 1 WHERE id = ?'
        ).run(reportId);
      }

      // 3. Check auto-expiry condition
      const checkReport = this.findById(reportId);
      if (checkReport && checkReport.contradiction_count >= checkReport.confirmation_count + 3) {
        this.database.prepare(
          "UPDATE live_commute_reports SET status = 'expired' WHERE id = ?"
        ).run(reportId);
        autoExpired = true;
      }
    });

    executeTransaction();

    return {
      updatedReport: this.findById(reportId),
      alreadyVoted: false,
      autoExpired
    };
  }
}

module.exports = {
  ReportRepository,
  reportRepository: new ReportRepository()
};
