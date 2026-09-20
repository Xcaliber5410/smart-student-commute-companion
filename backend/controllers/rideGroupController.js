const { z } = require('zod');
const { db } = require('../db/database');

const rideGroupSchema = z.object({
  creator_pseudonym: z.string().min(2),
  origin_area: z.string().min(2),
  destination_college: z.string().min(2),
  departure_time: z.string().min(2),
  mode: z.string().min(2),
  max_members: z.number().min(2).max(6).optional().default(3),
  notes: z.string().optional().default('')
});

function getRideGroups(req, res) {
  try {
    const groups = db.prepare('SELECT * FROM ride_groups ORDER BY created_at DESC LIMIT 20').all();
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function createRideGroup(req, res) {
  try {
    const parsed = rideGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }

    const { creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, notes } = parsed.data;
    const groupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;

    db.prepare(`
      INSERT INTO ride_groups 
      (id, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, current_members, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(groupId, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, notes, Date.now());

    const created = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId);
    res.status(201).json({ success: true, group: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function joinRideGroup(req, res) {
  try {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
    if (!group) return res.status(404).json({ error: 'Ride group not found' });
    if (group.current_members >= group.max_members) {
      return res.status(400).json({ error: 'This group is already full' });
    }

    db.prepare('UPDATE ride_groups SET current_members = current_members + 1 WHERE id = ?').run(id);
    const updated = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
    res.json({ success: true, message: 'Joined commute group successfully!', group: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getRideGroups,
  createRideGroup,
  joinRideGroup,
  rideGroupSchema
};
