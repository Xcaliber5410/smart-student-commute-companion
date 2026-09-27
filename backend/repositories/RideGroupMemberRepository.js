/**
 * RideGroupMemberRepository
 *
 * Data-access operations for student ride group membership.
 */

const { getConnection } = require('../db/connection');
const { RideGroupMember } = require('../models/RideGroupMember');
const { RideGroup } = require('../models/RideGroup');

class RideGroupMemberRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  addMember(groupId, userId, role = 'member') {
    const now = Date.now();
    const stmt = this.database.prepare(`
      INSERT OR IGNORE INTO ride_group_members (group_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(groupId, userId, role, now);

    const getStmt = this.database.prepare(
      'SELECT * FROM ride_group_members WHERE group_id = ? AND user_id = ?'
    );
    const row = getStmt.get(groupId, userId);
    return row ? RideGroupMember.fromRow(row) : null;
  }

  removeMember(groupId, userId) {
    const stmt = this.database.prepare(
      'DELETE FROM ride_group_members WHERE group_id = ? AND user_id = ?'
    );
    const res = stmt.run(groupId, userId);
    return res.changes > 0;
  }

  isMember(groupId, userId) {
    const stmt = this.database.prepare(
      'SELECT 1 FROM ride_group_members WHERE group_id = ? AND user_id = ?'
    );
    return Boolean(stmt.get(groupId, userId));
  }

  findGroupsByUserId(userId) {
    const stmt = this.database.prepare(`
      SELECT g.*, m.role as member_role, m.joined_at as member_joined_at
      FROM ride_groups g
      JOIN ride_group_members m ON g.id = m.group_id
      WHERE m.user_id = ?
      ORDER BY g.created_at DESC
    `);
    const rows = stmt.all(userId);
    return rows.map(r => ({
      group: RideGroup.fromRow(r).toRow(),
      membership: {
        role: r.member_role,
        joined_at: Number(r.member_joined_at)
      }
    }));
  }

  findMembersByGroupId(groupId) {
    const stmt = this.database.prepare(`
      SELECT m.id, m.group_id, m.user_id, m.role, m.joined_at, u.full_name, u.college_name
      FROM ride_group_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = ?
      ORDER BY m.joined_at ASC
    `);
    return stmt.all(groupId);
  }
}

const rideGroupMemberRepository = new RideGroupMemberRepository();

module.exports = {
  RideGroupMemberRepository,
  rideGroupMemberRepository
};
