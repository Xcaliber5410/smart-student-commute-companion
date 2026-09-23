/**
 * RideGroup Request Validation Schemas
 */

const { z } = require('zod');

const createRideGroupSchema = z.object({
  creator_pseudonym: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name cannot exceed 50 characters'),
  origin_area: z.string().trim().min(2, 'Origin area is required').max(100),
  destination_college: z.string().trim().min(2, 'Destination college is required').max(100),
  departure_time: z.string().trim().min(2, 'Departure time is required').max(30),
  mode: z.string().trim().min(2, 'Transit mode is required').max(50),
  max_members: z.coerce.number().int().min(2, 'Minimum group capacity is 2').max(6, 'Maximum group capacity is 6').optional().default(3),
  notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional().default('')
});

const updateRideGroupSchema = z.object({
  departure_time: z.string().trim().min(2).max(30).optional(),
  notes: z.string().trim().max(500).optional(),
  status: z.enum(['open', 'full', 'departed', 'cancelled']).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

const rideGroupFilterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mode: z.string().trim().max(50).optional(),
  origin: z.string().trim().max(100).optional(),
  destination: z.string().trim().max(100).optional(),
  status: z.enum(['open', 'full', 'departed', 'cancelled']).optional()
});

module.exports = {
  createRideGroupSchema,
  updateRideGroupSchema,
  rideGroupFilterQuerySchema
};
