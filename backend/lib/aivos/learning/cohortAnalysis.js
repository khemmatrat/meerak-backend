import { randomUUID } from 'crypto';

/**
 * Cohort Analysis – groups jobs by creation period and compares KPI trajectories.
 *
 * Cohorts are defined by a time bucket key (week or month).
 * Used to detect whether newer content outperforms older.
 */
export function createCohortAnalysis(deps = {}) {
  /** cohortKey -> { jobs: [], kpiSums: {}, count: 0 } */
  const cohorts = new Map();

  function _cohortKey(ts, granularity = 'week') {
    const d = new Date(ts || Date.now());
    if (granularity === 'month') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    return `W${week}`;
  }

  /** Assign a job to a cohort and record its KPIs. */
  function record({ jobId, ts = null, kpis = {}, granularity = 'week' }) {
    const key = _cohortKey(ts, granularity);
    if (!cohorts.has(key)) {
      cohorts.set(key, { key, jobs: [], kpiSums: { ctr: 0, avg_watch_seconds: 0, hook_score: 0, roi: 0 }, count: 0 });
    }
    const c = cohorts.get(key);
    c.jobs.push(jobId);
    c.count += 1;
    for (const [k, v] of Object.entries(kpis)) {
      if (typeof v === 'number') c.kpiSums[k] = (c.kpiSums[k] || 0) + v;
    }
    return key;
  }

  /** Get cohort KPI averages for a given key. */
  function getCohort(key) {
    const c = cohorts.get(key);
    if (!c) return null;
    const avgs = {};
    for (const [k, sum] of Object.entries(c.kpiSums)) {
      avgs[k] = c.count ? sum / c.count : 0;
    }
    return { key: c.key, count: c.count, avgs };
  }

  /** Compare all cohorts by a KPI field, ordered newest-first. */
  function compare(field = 'ctr') {
    return [...cohorts.values()]
      .map((c) => ({ key: c.key, count: c.count, avg: c.count ? (c.kpiSums[field] || 0) / c.count : 0 }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }

  function listKeys() { return [...cohorts.keys()]; }

  return { record, getCohort, compare, listKeys };
}

export default createCohortAnalysis;
