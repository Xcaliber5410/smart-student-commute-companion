/**
 * Transit Search Request Validation Schemas
 */

const { z } = require('zod');

const transitSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  lat: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional(),
  lon: z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional()
});

module.exports = {
  transitSearchQuerySchema
};
