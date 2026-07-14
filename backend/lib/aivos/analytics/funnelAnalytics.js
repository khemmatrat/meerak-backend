/**
 * Funnel Analytics – multi-step conversion funnel.
 *
 * A funnel is an ordered list of steps (event types). For each step, we count
 * how many unique jobIds (or sessions) progressed through that step, then
 * compute drop-off rates between consecutive steps.
 *
 * Example funnel: ['impression', 'click', 'watch', 'conversion', 'revenue']
 */
export function createFunnelAnalytics(deps = {}) {
  const storage = deps.storage;
  if (!storage) throw new Error('funnel_analytics_requires_storage');

  /**
   * Analyse a funnel defined by an ordered array of event type steps.
   *
   * @param {string[]} steps          Ordered event type names
   * @param {{ jobId?, platform?, from?, to? }} filter
   * @returns {{ steps: FunnelStep[], overall_conversion: number }}
   */
  function analyse(steps = [], filter = {}) {
    if (steps.length === 0) return { steps: [], overall_conversion: 0 };

    const stepData = steps.map((type) => {
      const events = storage.query({ ...filter, type });
      const uniqueJobs = new Set(events.map((e) => e.jobId).filter(Boolean));
      return {
        type,
        count: events.length,
        unique_jobs: uniqueJobs.size,
        events,
      };
    });

    const result = stepData.map((step, i) => {
      const prevCount = i === 0 ? step.count : stepData[i - 1].count;
      const dropOff = prevCount > 0 ? 1 - step.count / prevCount : 0;
      const throughRate = prevCount > 0 ? step.count / prevCount : 0;
      return {
        step: i + 1,
        type: step.type,
        count: step.count,
        unique_jobs: step.unique_jobs,
        through_rate: throughRate,
        drop_off: dropOff,
      };
    });

    const topCount = result[0]?.count || 0;
    const bottomCount = result[result.length - 1]?.count || 0;
    const overall_conversion = topCount > 0 ? bottomCount / topCount : 0;

    return { steps: result, overall_conversion };
  }

  /**
   * Standard content performance funnel.
   * impression → click → watch → conversion
   */
  function contentFunnel(filter = {}) {
    return analyse(['impression', 'click', 'watch', 'conversion'], filter);
  }

  /**
   * Revenue funnel.
   * impression → click → conversion → revenue
   */
  function revenueFunnel(filter = {}) {
    return analyse(['impression', 'click', 'conversion', 'revenue'], filter);
  }

  return { analyse, contentFunnel, revenueFunnel };
}

export default createFunnelAnalytics;
