/**
 * CommuteDisruption Domain Model
 *
 * Represents a transit delay, cancellation, waterlogging, or road disruption with 4-tier provenance.
 */

const { z } = require('zod');
const {
  disruptionTypeEnum,
  disruptionSeverityEnum,
  transportModeEnum,
  DataProvenance,
  provenanceSchema,
  normalizeDisruptionSeverity
} = require('./CommuteContracts');

const commuteDisruptionStatusEnum = z.enum(['active', 'expired', 'resolved']);

const commuteDisruptionSchema = z.object({
  id: z.string().min(1, 'Disruption ID is required'),
  type: disruptionTypeEnum,
  affectedMode: transportModeEnum,
  affectedRouteId: z.string().nullable().optional().default(null),
  affectedArea: z.string().min(2, 'Affected area is required').max(100),
  severity: disruptionSeverityEnum.default('moderate'),
  description: z.string().min(3, 'Description must be at least 3 characters').max(300),
  startTime: z.number().int().positive().default(() => Date.now()),
  endTime: z.number().int().positive(),
  status: commuteDisruptionStatusEnum.default('active'),
  estimatedDelayMinutes: z.number().int().min(0).default(0),
  provenance: provenanceSchema.default(() => DataProvenance.userReported('Community Commuter Feed').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class CommuteDisruption {
  constructor(data) {
    const validated = commuteDisruptionSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  static create(input) {
    const now = Date.now();
    const durationMs = (input.durationMinutes || 60) * 60 * 1000;
    const startTime = input.startTime || now;
    const endTime = input.endTime || (startTime + durationMs);
    const id = input.id || `disr-${now}-${Math.random().toString(36).substring(2, 7)}`;

    return new CommuteDisruption({
      ...input,
      id,
      severity: normalizeDisruptionSeverity(input.severity || 'moderate'),
      startTime,
      endTime,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now
    });
  }

  isActive(currentTime = Date.now()) {
    return this.status === 'active' && this.startTime <= currentTime && this.endTime > currentTime;
  }

  affectsMode(mode) {
    return this.affectedMode === mode;
  }

  affectsArea(area) {
    if (!area) return false;
    return this.affectedArea.toLowerCase().includes(area.toLowerCase()) || area.toLowerCase().includes(this.affectedArea.toLowerCase());
  }

  /**
   * Adapts a legacy LiveReport into a standardized CommuteDisruption domain instance.
   * @param {object} report - LiveReport instance or row
   * @returns {CommuteDisruption}
   */
  static fromLiveReport(report) {
    if (!report) return null;
    return new CommuteDisruption({
      id: `disr-${report.id}`,
      type: 'delay',
      affectedMode: report.mode,
      affectedRouteId: report.route_id || report.route_name || null,
      affectedArea: report.area,
      severity: normalizeDisruptionSeverity(report.impact),
      description: report.message,
      startTime: Number(report.created_at),
      endTime: Number(report.expires_at),
      status: report.status === 'active' ? 'active' : 'resolved',
      estimatedDelayMinutes: report.impact === 'high' ? 25 : report.impact === 'medium' ? 12 : 5,
      provenance: {
        sourceTier: 'USER_REPORTED',
        provider: 'Community Commuter Feed',
        confidence: report.confirmation_count > report.contradiction_count ? 'HIGH' : 'MEDIUM',
        lastUpdated: Number(report.created_at),
        description: `Crowdsourced report by ${report.pseudonym || 'Student Commuter'}`
      },
      createdAt: Number(report.created_at),
      updatedAt: Number(report.created_at)
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new CommuteDisruption({
      id: row.id,
      type: row.type,
      affectedMode: row.affected_mode,
      affectedRouteId: row.affected_route_id || null,
      affectedArea: row.affected_area,
      severity: normalizeDisruptionSeverity(row.severity),
      description: row.description,
      startTime: Number(row.start_time),
      endTime: Number(row.end_time),
      status: row.status,
      estimatedDelayMinutes: Number(row.estimated_delay_minutes || 0),
      provenance: {
        sourceTier: row.provenance_tier || 'USER_REPORTED',
        provider: row.provider || 'Community Feed',
        confidence: row.confidence || 'MEDIUM',
        lastUpdated: Number(row.updated_at || row.created_at)
      },
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at || row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      type: this.type,
      affected_mode: this.affectedMode,
      affected_route_id: this.affectedRouteId || null,
      affected_area: this.affectedArea,
      severity: this.severity,
      description: this.description,
      start_time: this.startTime,
      end_time: this.endTime,
      status: this.status,
      estimated_delay_minutes: this.estimatedDelayMinutes,
      provenance_tier: this.provenance.sourceTier,
      provider: this.provenance.provider,
      confidence: this.provenance.confidence,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      affectedMode: this.affectedMode,
      affectedRouteId: this.affectedRouteId,
      affectedArea: this.affectedArea,
      severity: this.severity,
      description: this.description,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      estimatedDelayMinutes: this.estimatedDelayMinutes,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  CommuteDisruption,
  commuteDisruptionSchema,
  commuteDisruptionStatusEnum
};
