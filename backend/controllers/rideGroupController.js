const { z } = require('zod');
const { db } = require('../db/database');
const { ValidationError, NotFoundError, BadRequestError } = require('../errors');

const rideGroupSchema = z.object({
  creator_pseudonym: z.string().min(2),
  origin_area: z.string().min(2),
  destination_college: z.string().min(2),
  departure_time: z.string().min(2),
  mode: z.string().min(2),
  max_members: z.number().min(2).max(6).optional().default(3),
  notes: z.string().optional().default('')
});

function getRideGroups(req, res, next) {
  try {
    const groups = db.prepare('SELECT * FROM ride_groups ORDER BY created_at DESC LIMIT 20').all();
    res.json({ success: true, groups });
  } catch (err) {
    next(err);
  }
}

function createRideGroup(req, res, next) {
  try {
    const parsed = rideGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Validation failed', parsed.error.format()));
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
    next(err);
  }
}

function joinRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
    if (!group) return next(new NotFoundError('Ride group not found'));
    if (group.current_members >= group.max_members) {
      return next(new BadRequestError('This group is already full', 'GROUP_FULL'));
    }

    db.prepare('UPDATE ride_groups SET current_members = current_members + 1 WHERE id = ?').run(id);
    const updated = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
    res.json({ success: true, message: 'Joined commute group successfully!', group: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRideGroups,
  createRideGroup,
  joinRideGroup,
  rideGroupSchema
};
