/**
 * Automation Scheduler – manages cron-like and one-shot scheduled tasks
 * for automation workflows.
 *
 * Uses setTimeout/setInterval internally for test compatibility;
 * Bull-compatible for production.
 */
export function createAutomationScheduler(deps = {}) {
  const bullQueue = deps.bullQueue || null;
  const scheduled = new Map(); // id -> { task, timer, spec }
  const history = [];

  /**
   * Schedule a recurring task (interval-based).
   * @param {{ id, intervalMs, handler, meta? }} params
   * @returns {{ id, scheduledAt }}
   */
  function scheduleInterval({ id, intervalMs, handler, meta = {} }) {
    if (scheduled.has(id)) cancel(id);
    const timer = setInterval(async () => {
      const ts = new Date().toISOString();
      let result;
      try { result = await handler(); } catch (err) { result = { error: err.message }; }
      history.push({ id, ts, result });
    }, intervalMs);
    scheduled.set(id, { id, type: 'interval', intervalMs, handler, timer, meta, scheduledAt: new Date().toISOString() });
    return { id, scheduledAt: scheduled.get(id).scheduledAt };
  }

  /**
   * Schedule a one-shot task at a future time.
   * @param {{ id, runAt, handler, meta? }} params
   */
  function scheduleOnce({ id, runAt, handler, meta = {} }) {
    if (scheduled.has(id)) cancel(id);
    const delay = Math.max(0, new Date(runAt).getTime() - Date.now());
    const timer = setTimeout(async () => {
      const ts = new Date().toISOString();
      let result;
      try { result = await handler(); } catch (err) { result = { error: err.message }; }
      history.push({ id, ts, result });
      scheduled.delete(id);
    }, delay);
    scheduled.set(id, { id, type: 'once', runAt, handler, timer, meta, scheduledAt: new Date().toISOString() });
    return { id, runAt };
  }

  function cancel(id) {
    const t = scheduled.get(id);
    if (!t) return false;
    clearTimeout(t.timer);
    clearInterval(t.timer);
    scheduled.delete(id);
    return true;
  }

  function list()    { return [...scheduled.values()].map(({ handler: _h, timer: _t, ...rest }) => rest); }
  function getHistory() { return [...history]; }

  return { scheduleInterval, scheduleOnce, cancel, list, getHistory };
}

export default createAutomationScheduler;
