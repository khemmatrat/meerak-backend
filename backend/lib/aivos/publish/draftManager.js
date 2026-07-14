import { randomUUID } from 'crypto';

/**
 * Draft Manager – save, retrieve, list, and delete publish drafts.
 *
 * Drafts hold the full publish intent (artifact, platforms, schedule, metadata)
 * before the user confirms publication. Immutable once published.
 */
export function createDraftManager(deps = {}) {
  /** in-memory store; replace with DB table in production */
  const drafts = new Map();

  /**
   * Save a new draft.
   * @param {{ jobId: string, artifact: object, platforms: string[], options?: object }} params
   * @returns {{ id, jobId, artifact, platforms, options, status, created_at }}
   */
  function save({ jobId, artifact, platforms = [], options = {} }) {
    const id = randomUUID();
    const draft = {
      id,
      jobId,
      artifact,
      platforms,
      options,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    drafts.set(id, draft);
    return draft;
  }

  /** Get a draft by id. */
  function get(id) {
    return drafts.get(id) || null;
  }

  /** Update a draft (merge options / platforms). */
  function update(id, patch = {}) {
    const existing = drafts.get(id);
    if (!existing) {
      const err = new Error('draft_not_found');
      err.code = 'DRAFT_NOT_FOUND';
      throw err;
    }
    if (existing.status === 'published') {
      const err = new Error('draft_already_published');
      err.code = 'DRAFT_ALREADY_PUBLISHED';
      throw err;
    }
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    drafts.set(id, updated);
    return updated;
  }

  /** Mark a draft as published (immutable after this). */
  function markPublished(id, result = {}) {
    return update(id, { status: 'published', published_result: result });
  }

  /** Delete a draft (only if not published). */
  function remove(id) {
    const draft = drafts.get(id);
    if (!draft) return false;
    if (draft.status === 'published') {
      const err = new Error('cannot_delete_published_draft');
      err.code = 'DRAFT_ALREADY_PUBLISHED';
      throw err;
    }
    drafts.delete(id);
    return true;
  }

  /** List drafts, optionally filtered by jobId or status. */
  function list(filter = {}) {
    const all = [...drafts.values()];
    return all.filter((d) => {
      if (filter.jobId && d.jobId !== filter.jobId) return false;
      if (filter.status && d.status !== filter.status) return false;
      return true;
    });
  }

  return { save, get, update, markPublished, remove, list };
}

export default createDraftManager;
