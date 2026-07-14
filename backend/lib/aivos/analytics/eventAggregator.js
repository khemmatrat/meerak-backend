/**
 * Event Aggregator – rolls up raw events into time-bucket summaries.
 *
 * Supported granularities: 'hour' | 'day' | 'week' | 'month'
 *
 * Each bucket contains counts and sums per event type, enabling
 * time-series charts in the Dashboard API.
 */
export function createEventAggregator(deps = {}) {
  const storage = deps.storage;
  if (!storage) throw new Error('event_aggregator_requires_storage');

  /**
   * Truncate an ISO timestamp to the given granularity bucket key.
   * @param {string} ts      ISO datetime string
   * @param {'hour'|'day'|'week'|'month'} granularity
   * @returns {string}  Bucket key e.g. "2026-06-28T14:00:00.000Z"
   */
  function bucketKey(ts, granularity) {
    const d = new Date(ts);
    switch (granularity) {
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week': {
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
      }
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      default:
        d.setHours(0, 0, 0, 0);
    }
    return d.toISOString();
  }

  /**
   * Aggregate events by time bucket.
   *
   * @param {{ type?, jobId?, platform?, from?, to?, granularity? }} options
   * @returns {Map<string, { bucket, count, sum, byType: Record<string,{count,sum}> }>}
   */
  function aggregate(options = {}) {
    const granularity = options.granularity || 'day';
    const events = storage.query({
      type: options.type,
      jobId: options.jobId,
      platform: options.platform,
      from: options.from,
      to: options.to,
    });

    const buckets = new Map();

    for (const ev of events) {
      const key = bucketKey(ev.ts, granularity);
      if (!buckets.has(key)) {
        buckets.set(key, { bucket: key, count: 0, sum: 0, byType: {} });
      }
      const b = buckets.get(key);
      b.count += 1;
      b.sum += Number(ev.value) || 0;

      if (!b.byType[ev.type]) b.byType[ev.type] = { count: 0, sum: 0 };
      b.byType[ev.type].count += 1;
      b.byType[ev.type].sum += Number(ev.value) || 0;
    }

    return buckets;
  }

  /**
   * Get aggregated time-series as a sorted array of bucket objects.
   */
  function timeSeries(options = {}) {
    const map = aggregate(options);
    return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /**
   * Get totals across all time for a set of event types.
   * @param {string[]} types
   * @param {{ jobId?, platform?, from?, to? }} filter
   */
  function totals(types = [], filter = {}) {
    const result = {};
    for (const type of types) {
      const events = storage.query({ ...filter, type });
      result[type] = {
        count: events.length,
        sum: events.reduce((s, e) => s + (Number(e.value) || 0), 0),
      };
    }
    return result;
  }

  return { aggregate, timeSeries, totals, bucketKey };
}

export default createEventAggregator;
