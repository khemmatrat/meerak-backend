/**
 * Automation Audit – immutable append-only log of all automation actions.
 *
 * Every automation module logs here. Provides query, export, and summary APIs.
 */
export function createAutomationAudit(deps = {}) {
  const entries = [];

  /**
   * Append an audit entry.
   * @param {{ type, ...meta }} entry
   */
  function log(entry) {
    entries.push({ ...entry, ts: new Date().toISOString(), seq: entries.length + 1 });
  }

  /**
   * Query audit entries.
   * @param {{ type?, since?, limit? }} filter
   * @returns {object[]}
   */
  function query(filter = {}) {
    let result = entries;
    if (filter.type) result = result.filter((e) => e.type === filter.type);
    if (filter.since) result = result.filter((e) => e.ts >= filter.since);
    if (filter.limit) result = result.slice(-filter.limit);
    return result;
  }

  /** Summary statistics. */
  function summary() {
    const counts = {};
    for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
    return { total: entries.length, byType: counts, oldest: entries[0]?.ts, newest: entries[entries.length - 1]?.ts };
  }

  function all()   { return [...entries]; }
  function count() { return entries.length; }

  return { log, query, summary, all, count };
}

export default createAutomationAudit;
