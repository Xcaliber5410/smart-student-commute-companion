/**
 * ReportConfirmation Model
 *
 * Represents a student's verification vote (confirm or contradict) on a disruption report.
 */

const { z } = require('zod');

const reportConfirmationSchema = z.object({
  id: z.number().int().positive().optional(),
  report_id: z.string().min(1, 'Report ID is required'),
  user_token: z.string().min(2, 'User token is required').max(128),
  action: z.enum(['confirm', 'contradict']),
  created_at: z.number().int().positive().default(() => Date.now())
});

class ReportConfirmation {
  constructor(data) {
    const validated = reportConfirmationSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    return new ReportConfirmation({
      ...input,
      created_at: input.created_at || Date.now()
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new ReportConfirmation({
      id: row.id ? Number(row.id) : undefined,
      report_id: row.report_id,
      user_token: row.user_token,
      action: row.action,
      created_at: Number(row.created_at)
    });
  }

  toRow() {
    return {
      ...(this.id ? { id: this.id } : {}),
      report_id: this.report_id,
      user_token: this.user_token,
      action: this.action,
      created_at: this.created_at
    };
  }
}

module.exports = {
  ReportConfirmation,
  reportConfirmationSchema
};
