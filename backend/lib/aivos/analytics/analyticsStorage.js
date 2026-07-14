import { randomUUID } from 'crypto';

/**
 * Analytics Storage – append-only event store with time-window queries.
 *
 * Events are keyed by type and can be queried by jobId, platform, time range,
 * or event name. Each event is immutable once stored.
 *
 * Supported event types (extensible):
 *   view | impression | click | watch | convert | purchase | publish | pipeline
 */
export function createAnalyticsStorage(deps = {}) {
  const events = [];                          // append-only
  const indexes = {
    byJob: new Map(),                         // jobId -> [idx]
    byPlatform: new Map(),                    // platform -> [idx]
    byType: new Map(),                        // type -> [idx]
  };

  function _index(idx, event) {
    const addTo = (map, key) => {
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(idx);
    };
    addTo(indexes.byJob, event.jobId);
    addTo(indexes.byPlatform, event.platform);
    addTo(indexes.byType, event.type);
  }

  /**
   * Append an analytics event.
   * @param {{ type, jobId?, platform?, value?, meta? }} params
   * @returns {object} Stored event
   */
  function append({ type, jobId = null, platform = null, value = null, meta = {}, ts = null }) {
    const event = {
      id: randomUUID(),
      type,
      jobId,
      platform,
      value,
      meta,
      ts: ts || new Date().toISOString(),
    };
    const idx = events.length;
    events.push(event);
    _index(idx, event);
    return event;
  }

  /**
   * Query events with optional filters.
   * @param {{ type?, jobId?, platform?, from?, to? }} filter
   */
  function query(filter = {}) {
    let candidates = events;

    if (filter.type && indexes.byType.has(filter.type)) {
      const idxs = indexes.byType.get(filter.type);
      candidates = idxs.map((i) => events[i]);
    } else if (filter.jobId && indexes.byJob.has(filter.jobId)) {
      const idxs = indexes.byJob.get(filter.jobId);
      candidates = idxs.map((i) => events[i]);
    } else if (filter.platform && indexes.byPlatform.has(filter.platform)) {
      const idxs = indexes.byPlatform.get(filter.platform);
      candidates = idxs.map((i) => events[i]);
    }

    return candidates.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.jobId && e.jobId !== filter.jobId) return false;
      if (filter.platform && e.platform !== filter.platform) return false;
      if (filter.from && e.ts < filter.from) return false;
      if (filter.to && e.ts > filter.to) return false;
      return true;
    });
  }

  /** Count events matching a filter. */
  function count(filter = {}) {
    return query(filter).length;
  }

  /** Sum numeric values for matching events. */
  function sum(filter = {}) {
    return query(filter).reduce((acc, e) => acc + (Number(e.value) || 0), 0);
  }

  /** All stored events (read-only copy). */
  function all() {
    return [...events];
  }

  /** Total stored event count. */
  function size() {
    return events.length;
  }

  return { append, query, count, sum, all, size };
}

export default createAnalyticsStorage;
