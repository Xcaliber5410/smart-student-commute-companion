/**
 * StudyResource Domain Model
 *
 * Represents a student-owned study material, note, reference, web link, or document metadata.
 * Optionally linked to a course, assignment, goal, or study session.
 */

const { z } = require('zod');

const resourceTypeEnum = z.enum(['note', 'link', 'reference', 'document', 'other']);

const studyResourceSchema = z.object({
  id: z.string().min(1, 'Resource ID is required'),
  user_id: z.string().min(1, 'User ID is required'),
  course_id: z.string().nullable().default(null),
  assignment_id: z.string().nullable().default(null),
  goal_id: z.string().nullable().default(null),
  study_session_id: z.string().nullable().default(null),
  title: z.string().min(1, 'Resource title must not be empty').max(200, 'Title cannot exceed 200 characters'),
  description: z.string().max(1000).nullable().default(null),
  resource_type: resourceTypeEnum.default('note'),
  url: z.string().max(1000).nullable().default(null),
  content: z.string().nullable().default(null),
  file_name: z.string().max(255).nullable().default(null),
  file_size: z.number().int().nonnegative().nullable().default(null),
  mime_type: z.string().max(100).nullable().default(null),
  tags: z.union([z.array(z.string()), z.string()]).nullable().default(null),
  is_favorite: z.number().int().min(0).max(1).default(0),
  archived: z.number().int().min(0).max(1).default(0),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class StudyResource {
  constructor(data) {
    const validated = studyResourceSchema.parse(data);
    Object.assign(this, validated);

    // Normalize tags to array
    if (typeof this.tags === 'string') {
      try {
        const parsed = JSON.parse(this.tags);
        this.tags = Array.isArray(parsed) ? parsed : [this.tags];
      } catch {
        this.tags = this.tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    } else if (!Array.isArray(this.tags)) {
      this.tags = [];
    }
  }

  static create(input) {
    const now = Date.now();
    const id = input.id || `res-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const isFavorite = input.is_favorite !== undefined
      ? (input.is_favorite ? 1 : 0)
      : (input.favorite !== undefined ? (input.favorite ? 1 : 0) : 0);
    const archived = input.archived !== undefined ? (input.archived ? 1 : 0) : 0;

    let tags = input.tags;
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    return new StudyResource({
      ...input,
      id,
      course_id: input.course_id || null,
      assignment_id: input.assignment_id || null,
      goal_id: input.goal_id || null,
      study_session_id: input.study_session_id || null,
      description: input.description || null,
      resource_type: input.resource_type || input.type || 'note',
      url: input.url || null,
      content: input.content || null,
      file_name: input.file_name || input.fileName || null,
      file_size: input.file_size !== undefined && input.file_size !== null ? Number(input.file_size) : null,
      mime_type: input.mime_type || input.mimeType || null,
      tags: Array.isArray(tags) ? tags : [],
      is_favorite: isFavorite,
      archived,
      created_at: input.created_at || now,
      updated_at: input.updated_at || now
    });
  }

  static fromRow(row) {
    if (!row) return null;
    let tags = [];
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = String(row.tags).split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    return new StudyResource({
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id || null,
      assignment_id: row.assignment_id || null,
      goal_id: row.goal_id || null,
      study_session_id: row.study_session_id || null,
      title: row.title,
      description: row.description || null,
      resource_type: row.resource_type || 'note',
      url: row.url || null,
      content: row.content || null,
      file_name: row.file_name || null,
      file_size: row.file_size !== null && row.file_size !== undefined ? Number(row.file_size) : null,
      mime_type: row.mime_type || null,
      tags,
      is_favorite: row.is_favorite ? 1 : 0,
      archived: row.archived ? 1 : 0,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      user_id: this.user_id,
      course_id: this.course_id,
      assignment_id: this.assignment_id,
      goal_id: this.goal_id,
      study_session_id: this.study_session_id,
      title: this.title,
      description: this.description,
      resource_type: this.resource_type,
      url: this.url,
      content: this.content,
      file_name: this.file_name,
      file_size: this.file_size,
      mime_type: this.mime_type,
      tags: JSON.stringify(this.tags || []),
      is_favorite: this.is_favorite ? 1 : 0,
      archived: this.archived ? 1 : 0,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      userId: this.user_id,
      course_id: this.course_id,
      courseId: this.course_id,
      assignment_id: this.assignment_id,
      assignmentId: this.assignment_id,
      goal_id: this.goal_id,
      goalId: this.goal_id,
      study_session_id: this.study_session_id,
      studySessionId: this.study_session_id,
      title: this.title,
      description: this.description,
      resource_type: this.resource_type,
      resourceType: this.resource_type,
      type: this.resource_type,
      url: this.url,
      content: this.content,
      file_name: this.file_name,
      fileName: this.file_name,
      file_size: this.file_size,
      fileSize: this.file_size,
      mime_type: this.mime_type,
      mimeType: this.mime_type,
      tags: this.tags,
      is_favorite: this.is_favorite ? 1 : 0,
      isFavorite: Boolean(this.is_favorite),
      archived: Boolean(this.archived),
      created_at: this.created_at,
      createdAt: this.created_at,
      updated_at: this.updated_at,
      updatedAt: this.updated_at
    };
  }

  isArchived() {
    return Boolean(this.archived);
  }

  isFavorite() {
    return Boolean(this.is_favorite);
  }

  hasTag(tag) {
    if (!tag || !Array.isArray(this.tags)) return false;
    const clean = tag.toLowerCase().trim();
    return this.tags.some(t => t.toLowerCase() === clean);
  }
}

module.exports = {
  StudyResource,
  studyResourceSchema,
  resourceTypeEnum
};
