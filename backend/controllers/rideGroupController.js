const { z } = require('zod');
const { rideGroupRepository } = require('../repositories/RideGroupRepository');
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
    const groups = rideGroupRepository.findRecent(20);
    res.json({ success: true, groups: groups.map(g => g.toRow()) });
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

    const created = rideGroupRepository.create(parsed.data);
    res.status(201).json({ success: true, group: created.toRow() });
  } catch (err) {
    next(err);
  }
}

function joinRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    const group = rideGroupRepository.findById(id);
    if (!group) return next(new NotFoundError('Ride group not found'));
    if (group.isFull()) {
      return next(new BadRequestError('This group is already full', 'GROUP_FULL'));
    }

    const updated = rideGroupRepository.incrementMembers(id);
    res.json({ success: true, message: 'Joined commute group successfully!', group: updated.toRow() });
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
