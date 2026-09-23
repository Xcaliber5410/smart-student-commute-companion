const { z } = require('zod');
const { rideGroupService } = require('../services');
const { ValidationError } = require('../errors');
const { success, created, paginated } = require('../utils/apiResponse');

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
    const result = rideGroupService.listRideGroups(req.query);
    return paginated(res, {
      dataKey: 'groups',
      data: result.groups,
      pagination: result.pagination
    });
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

    const newGroup = rideGroupService.createRideGroup(parsed.data);
    return created(res, { group: newGroup });
  } catch (err) {
    next(err);
  }
}

function joinRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    const updated = rideGroupService.joinRideGroup(id);
    return success(res, { message: 'Joined commute group successfully!', group: updated });
  } catch (err) {
    next(err);
  }
}

function getRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    const group = rideGroupService.getRideGroupById(id);
    return success(res, { group });
  } catch (err) {
    next(err);
  }
}

function updateRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    const updated = rideGroupService.updateRideGroup(id, req.body);
    return success(res, { group: updated });
  } catch (err) {
    next(err);
  }
}

function deleteRideGroup(req, res, next) {
  try {
    const { id } = req.params;
    rideGroupService.deleteRideGroup(id);
    return success(res, { message: 'Ride group deleted successfully', id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRideGroups,
  getRideGroup,
  createRideGroup,
  updateRideGroup,
  deleteRideGroup,
  joinRideGroup,
  rideGroupSchema
};
