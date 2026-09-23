/**
 * Common Parameter & Query Validation Schemas
 */

const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().trim().min(1, 'Identifier is required').max(100, 'Identifier exceeds maximum allowed length')
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20)
});

module.exports = {
  idParamSchema,
  paginationQuerySchema
};
