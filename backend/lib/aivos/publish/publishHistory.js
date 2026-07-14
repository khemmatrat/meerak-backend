import { randomUUID } from 'crypto';

/**
 * Publish History – immutable append-only log of all publish events.
 *
 * Records each publish attempt with platform, status, URL, metadata, and
 * render artifact provenance. Used by Analytics Engine (Phase 5.9).
 */
export function createPublishHistory(deps = {}) {
  const records = [];

  /**
   * Append a publish record.
   * @param {{ jobId, platform, published_id, published_url, status, artifact, renderMetadata?, analyticsEventId? }} params
   */
  function append({ jobId, platform, published_id, published_url, status, artifact = null, renderMetadata = null, analyticsEventId = null, error = null }) {
    const record = {
      id: randomUUID(),
      jobId,
      platform,
      published_id,
      published_url,
      status,
      artifact: artifact ? { uri: artifact.uri, hash: artifact.hash, template: artifact.template } : null,
      renderMetadata,
      analyticsEventId,
      error,
      created_at: new Date().toISOString(),
    };
    records.push(record);
    return record;
  }

  /** List history records, optionally filtered by jobId or platform. */
  function list(filter = {}) {
    return records.filter((r) => {
      if (filter.jobId && r.jobId !== filter.jobId) return false;
      if (filter.platform && r.platform !== filter.platform) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    });
  }

  /** Get a single record by id. */
  function get(id) {
    return records.find((r) => r.id === id) || null;
  }

  /** Count of successful publishes per platform. */
  function stats() {
    const byPlatform = {};
    for (const r of records) {
      if (!byPlatform[r.platform]) byPlatform[r.platform] = { published: 0, failed: 0 };
      if (r.status === 'published') byPlatform[r.platform].published += 1;
      else if (r.status === 'failed') byPlatform[r.platform].failed += 1;
    }
    return { total: records.length, byPlatform };
  }

  return { append, list, get, stats };
}

export default createPublishHistory;
