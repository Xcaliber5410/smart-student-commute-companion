/**
 * Study Resource Request Validation Schemas
 *
 * Provides schema validation and normalization for student study resources.
 */

const { z } = require('zod');

const resourceTypeEnum = z.enum(['note', 'link', 'reference', 'document', 'other']);

const createStudyResourceSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').nullable().optional(),
  resource_type: resourceTypeEnum.optional(),
  resourceType: resourceTypeEnum.optional(),
  type: resourceTypeEnum.optional(),
  url: z.string().trim().max(1000).nullable().optional(),
  content: z.string().max(50000, 'Content cannot exceed 50000 characters').nullable().optional(),
  file_name: z.string().trim().max(255).nullable().optional(),
  fileName: z.string().trim().max(255).nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  fileSize: z.coerce.number().int().nonnegative().nullable().optional(),
  mime_type: z.string().trim().max(100).nullable().optional(),
  mimeType: z.string().trim().max(100).nullable().optional(),
  tags: z.union([
    z.array(z.string().trim().min(1).max(50)),
    z.string().trim()
  ]).optional(),
  is_favorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  isFavorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  favorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  archived: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  course_id: z.string().trim().nullable().optional(),
  courseId: z.string().trim().nullable().optional(),
  assignment_id: z.string().trim().nullable().optional(),
  assignmentId: z.string().trim().nullable().optional(),
  goal_id: z.string().trim().nullable().optional(),
  goalId: z.string().trim().nullable().optional(),
  study_session_id: z.string().trim().nullable().optional(),
  studySessionId: z.string().trim().nullable().optional()
}).transform(data => {
  const result = {
    title: data.title,
    description: data.description || null,
    resource_type: data.resource_type || data.resourceType || data.type || 'note',
    url: data.url || null,
    content: data.content || null,
    file_name: data.file_name || data.fileName || null,
    file_size: data.file_size !== undefined ? data.file_size : (data.fileSize !== undefined ? data.fileSize : null),
    mime_type: data.mime_type || data.mimeType || null,
    tags: Array.isArray(data.tags)
      ? data.tags
      : (typeof data.tags === 'string' ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    is_favorite: data.is_favorite !== undefined
      ? (data.is_favorite ? 1 : 0)
      : (data.isFavorite !== undefined ? (data.isFavorite ? 1 : 0) : (data.favorite ? 1 : 0)),
    archived: data.archived ? 1 : 0,
    course_id: data.course_id !== undefined ? data.course_id : (data.courseId !== undefined ? data.courseId : null),
    assignment_id: data.assignment_id !== undefined ? data.assignment_id : (data.assignmentId !== undefined ? data.assignmentId : null),
    goal_id: data.goal_id !== undefined ? data.goal_id : (data.goalId !== undefined ? data.goalId : null),
    study_session_id: data.study_session_id !== undefined ? data.study_session_id : (data.studySessionId !== undefined ? data.studySessionId : null)
  };
  return result;
});

const updateStudyResourceSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  resource_type: resourceTypeEnum.optional(),
  resourceType: resourceTypeEnum.optional(),
  type: resourceTypeEnum.optional(),
  url: z.string().trim().max(1000).nullable().optional(),
  content: z.string().max(50000).nullable().optional(),
  file_name: z.string().trim().max(255).nullable().optional(),
  fileName: z.string().trim().max(255).nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  fileSize: z.coerce.number().int().nonnegative().nullable().optional(),
  mime_type: z.string().trim().max(100).nullable().optional(),
  mimeType: z.string().trim().max(100).nullable().optional(),
  tags: z.union([
    z.array(z.string().trim().min(1).max(50)),
    z.string().trim()
  ]).optional(),
  is_favorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  isFavorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  favorite: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  archived: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  course_id: z.string().trim().nullable().optional(),
  courseId: z.string().trim().nullable().optional(),
  assignment_id: z.string().trim().nullable().optional(),
  assignmentId: z.string().trim().nullable().optional(),
  goal_id: z.string().trim().nullable().optional(),
  goalId: z.string().trim().nullable().optional(),
  study_session_id: z.string().trim().nullable().optional(),
  studySessionId: z.string().trim().nullable().optional()
}).transform(data => {
  const result = {};
  if (data.title !== undefined) result.title = data.title;
  if (data.description !== undefined) result.description = data.description;

  const rType = data.resource_type || data.resourceType || data.type;
  if (rType !== undefined) result.resource_type = rType;

  if (data.url !== undefined) result.url = data.url;
  if (data.content !== undefined) result.content = data.content;

  const fName = data.file_name !== undefined ? data.file_name : data.fileName;
  if (fName !== undefined) result.file_name = fName;

  const fSize = data.file_size !== undefined ? data.file_size : data.fileSize;
  if (fSize !== undefined) result.file_size = fSize;

  const mType = data.mime_type !== undefined ? data.mime_type : data.mimeType;
  if (mType !== undefined) result.mime_type = mType;

  if (data.tags !== undefined) {
    result.tags = Array.isArray(data.tags)
      ? data.tags
      : (typeof data.tags === 'string' ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
  }

  const fav = data.is_favorite !== undefined ? data.is_favorite : (data.isFavorite !== undefined ? data.isFavorite : data.favorite);
  if (fav !== undefined) result.is_favorite = fav ? 1 : 0;

  if (data.archived !== undefined) result.archived = data.archived ? 1 : 0;

  const cId = data.course_id !== undefined ? data.course_id : data.courseId;
  if (cId !== undefined) result.course_id = cId;

  const aId = data.assignment_id !== undefined ? data.assignment_id : data.assignmentId;
  if (aId !== undefined) result.assignment_id = aId;

  const gId = data.goal_id !== undefined ? data.goal_id : data.goalId;
  if (gId !== undefined) result.goal_id = gId;

  const sId = data.study_session_id !== undefined ? data.study_session_id : data.studySessionId;
  if (sId !== undefined) result.study_session_id = sId;

  return result;
});

const studyResourceFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  resource_type: resourceTypeEnum.optional(),
  resourceType: resourceTypeEnum.optional(),
  type: resourceTypeEnum.optional(),
  course_id: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
  assignment_id: z.string().trim().optional(),
  assignmentId: z.string().trim().optional(),
  goal_id: z.string().trim().optional(),
  goalId: z.string().trim().optional(),
  study_session_id: z.string().trim().optional(),
  studySessionId: z.string().trim().optional(),
  is_favorite: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional(),
  isFavorite: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional(),
  favorite: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional(),
  archived: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional(),
  q: z.string().trim().optional(),
  query: z.string().trim().optional(),
  searchTerm: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  sort: z.enum(['created_at', 'updated_at', 'title']).default('created_at'),
  order: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('desc')
}).transform(data => ({
  page: data.page,
  limit: data.limit,
  resource_type: data.resource_type || data.resourceType || data.type || undefined,
  course_id: data.course_id || data.courseId || undefined,
  assignment_id: data.assignment_id || data.assignmentId || undefined,
  goal_id: data.goal_id || data.goalId || undefined,
  study_session_id: data.study_session_id || data.studySessionId || undefined,
  is_favorite: data.is_favorite !== undefined ? data.is_favorite : (data.isFavorite !== undefined ? data.isFavorite : data.favorite),
  archived: data.archived,
  searchTerm: data.searchTerm || data.query || data.q || undefined,
  tag: data.tag || undefined,
  sort: data.sort,
  order: data.order.toLowerCase()
}));

const linkResourcesSchema = z.object({
  resource_ids: z.array(z.string().min(1)).min(1, 'At least one resource ID must be provided').optional(),
  resourceIds: z.array(z.string().min(1)).min(1, 'At least one resource ID must be provided').optional()
}).refine(data => (data.resource_ids && data.resource_ids.length > 0) || (data.resourceIds && data.resourceIds.length > 0), {
  message: 'resource_ids must contain at least one resource ID'
}).transform(data => ({
  resource_ids: data.resource_ids || data.resourceIds,
  resourceIds: data.resource_ids || data.resourceIds
}));

const entityAndResourceParamSchema = z.object({
  id: z.string().min(1, 'Entity ID is required'),
  resourceId: z.string().min(1, 'Resource ID is required')
});

module.exports = {
  resourceTypeEnum,
  createStudyResourceSchema,
  updateStudyResourceSchema,
  studyResourceFilterSchema,
  linkResourcesSchema,
  entityAndResourceParamSchema
};

