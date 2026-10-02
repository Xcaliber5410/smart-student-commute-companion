/**
 * Student Workflow Request Validation Schemas
 */

const { z } = require('zod');

// 1. Profile / Context
const studentProfileUpdateSchema = z.object({
  home_area: z.string().max(100).optional(),
  default_college: z.string().max(150).optional(),
  preferred_modes: z.array(z.string()).optional(),
  walking_tolerance_minutes: z.number().int().min(5).max(60).optional(),
  max_budget_rupees: z.number().int().min(0).max(2000).optional(),
  default_arrival_time: z.string().optional(),
  full_name: z.string().min(2).max(100).optional(),
  college_name: z.string().min(2).max(150).optional()
});

// 2. Schedules
const createScheduleSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(100),
  origin: z.string().min(2, 'Origin is required').max(150),
  destination: z.string().min(2, 'Destination is required').max(150),
  target_arrival_time: z.string().min(2).max(20),
  days_of_week: z.array(z.string()).optional().default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
  reminder_enabled: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true)
});

const updateScheduleSchema = z.object({
  title: z.string().min(2).max(100).optional(),
  origin: z.string().min(2).max(150).optional(),
  destination: z.string().min(2).max(150).optional(),
  target_arrival_time: z.string().min(2).max(20).optional(),
  days_of_week: z.array(z.string()).optional(),
  reminder_enabled: z.boolean().optional(),
  active: z.boolean().optional()
});

const scheduleFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  active: z.union([
    z.boolean(),
    z.string().transform(v => v.toLowerCase() === 'true' || v === '1'),
    z.number().transform(v => v === 1)
  ]).optional(),
  day: z.string().optional(),
  day_of_week: z.string().optional(),
  search: z.string().optional()
});

// 3. Saved Routes
const createSavedRouteSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  origin: z.string().min(2, 'Origin is required').max(150),
  destination: z.string().min(2, 'Destination is required').max(150),
  preferred_mode: z.string().optional().default('balanced'),
  max_budget: z.number().int().min(0).max(2000).optional().default(100),
  summary: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([])
});

const updateSavedRouteSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  origin: z.string().min(2).max(150).optional(),
  destination: z.string().min(2).max(150).optional(),
  preferred_mode: z.string().optional(),
  max_budget: z.number().int().min(0).max(2000).optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const savedRouteFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  preferred_mode: z.enum(['balanced', 'fastest', 'cheapest', 'train', 'metro', 'bus', 'auto', 'cab', 'walking']).optional(),
  max_budget: z.coerce.number().optional(),
  tag: z.string().optional(),
  search: z.string().optional()
});

// 4. Student Groups
const studentGroupFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  role: z.enum(['creator', 'member']).optional(),
  mode: z.string().optional(),
  search: z.string().optional()
});

// 5. Student Insights / Overview
const studentInsightsFilterSchema = z.object({
  range: z.enum(['today', 'week', 'current_week', 'month', 'current_month', 'custom']).optional().default('week'),
  from: z.union([z.string(), z.number()]).optional(),
  to: z.union([z.string(), z.number()]).optional(),
  days: z.coerce.number().int().min(1).max(30).optional().default(7)
});

module.exports = {
  studentProfileUpdateSchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleFilterSchema,
  createSavedRouteSchema,
  updateSavedRouteSchema,
  savedRouteFilterSchema,
  studentGroupFilterSchema,
  studentInsightsFilterSchema
};

