/**
 * Metrics Collector – ingests raw events from Runtime, Pipeline, and Publish
 * and normalises them into the Analytics Storage schema.
 *
 * Attach to a runtimeEvents bus via subscribe() or call ingest() directly.
 */
export function createMetricsCollector(deps = {}) {
  const storage = deps.storage;

  if (!storage) throw new Error('metrics_collector_requires_storage');

  /**
   * Ingest a normalised analytics event.
   * @param {{ type, jobId?, platform?, value?, meta? }} raw
   */
  function ingest(raw) {
    return storage.append({
      type: raw.type || 'unknown',
      jobId: raw.jobId || null,
      platform: raw.platform || null,
      value: raw.value ?? null,
      meta: raw.meta || {},
      ts: raw.ts || new Date().toISOString(),
    });
  }

  /**
   * Track a video impression (content was shown to a user).
   */
  function trackImpression({ jobId, platform, meta = {} }) {
    return ingest({ type: 'impression', jobId, platform, value: 1, meta });
  }

  /**
   * Track a click-through from an impression.
   */
  function trackClick({ jobId, platform, meta = {} }) {
    return ingest({ type: 'click', jobId, platform, value: 1, meta });
  }

  /**
   * Track watch time in seconds.
   * @param {number} seconds  Seconds watched
   */
  function trackWatchTime({ jobId, platform, seconds, meta = {} }) {
    return ingest({ type: 'watch', jobId, platform, value: seconds, meta });
  }

  /**
   * Track a conversion (lead, sign-up, purchase intent).
   */
  function trackConversion({ jobId, platform, value = 1, meta = {} }) {
    return ingest({ type: 'conversion', jobId, platform, value, meta });
  }

  /**
   * Track revenue (actual payment).
   * @param {number} amount  Revenue in base currency units
   */
  function trackRevenue({ jobId, platform, amount, meta = {} }) {
    return ingest({ type: 'revenue', jobId, platform, value: amount, meta });
  }

  /**
   * Track cost (ad spend, compute, etc.).
   */
  function trackCost({ jobId, platform, amount, meta = {} }) {
    return ingest({ type: 'cost', jobId, platform, value: amount, meta });
  }

  /**
   * Consume an ACP event from the Runtime events bus and map it to metrics.
   * Returns the ingested event or null if the event type is not tracked.
   */
  function consumeRuntimeEvent(envelope) {
    const name = envelope?.name;
    const payload = envelope?.payload || {};
    const jobId = envelope?.correlationId || payload?.jobId || null;

    if (name === 'aivos.publish.completed') {
      const platforms = payload?.success || [];
      for (const platform of platforms) {
        ingest({ type: 'publish', jobId, platform, value: 1, meta: { publishId: payload?.publishId } });
      }
      return platforms.length;
    }

    if (name === 'aivos.pipeline.stage.completed' && payload?.nodeId === 'publish') {
      ingest({ type: 'pipeline_publish', jobId, platform: null, value: 1, meta: { nodeId: 'publish' } });
      return 1;
    }

    return null;
  }

  return {
    ingest,
    trackImpression,
    trackClick,
    trackWatchTime,
    trackConversion,
    trackRevenue,
    trackCost,
    consumeRuntimeEvent,
  };
}

export default createMetricsCollector;
