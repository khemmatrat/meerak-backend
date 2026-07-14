import { randomUUID } from 'crypto';

/**
 * Publish Scheduler – schedule publish jobs for future execution.
 *
 * Uses an in-memory sorted list of scheduled jobs. Production should persist
 * to a DB table and trigger via cron / Bull delayed jobs.
 */
export function createScheduler(deps = {}) {
  const scheduled = new Map();
  let timers = new Map();

  const publishService = deps.publishService || null;

  /**
   * Schedule a publish at a specific ISO datetime.
   * @param {{ draftId?: string, jobId: string, artifact: object, platforms: string[], options?: object, scheduledAt: string }} params
   */
  function schedule({ draftId, jobId, artifact, platforms, options = {}, scheduledAt }) {
    if (!scheduledAt) {
      const err = new Error('scheduled_at_required');
      err.code = 'SCHEDULER_MISSING_TIME';
      throw err;
    }

    const id = randomUUID();
    const fireAt = new Date(scheduledAt).getTime();
    const entry = {
      id,
      draftId: draftId || null,
      jobId,
      artifact,
      platforms,
      options,
      scheduledAt,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      fired_at: null,
      result: null,
    };
    scheduled.set(id, entry);

    const delay = Math.max(0, fireAt - Date.now());

    if (publishService) {
      const timer = setTimeout(async () => {
        entry.status = 'firing';
        entry.fired_at = new Date().toISOString();
        try {
          const result = await publishService.publish(jobId, artifact, platforms, options);
          entry.status = 'done';
          entry.result = result;
        } catch (e) {
          entry.status = 'failed';
          entry.error = e.message;
        }
      }, delay);
      timers.set(id, timer);
    }

    return entry;
  }

  /** Cancel a scheduled publish. */
  function cancel(id) {
    const entry = scheduled.get(id);
    if (!entry) return false;
    if (entry.status !== 'scheduled') return false;
    if (timers.has(id)) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    }
    entry.status = 'cancelled';
    return true;
  }

  /** Get a scheduled entry by id. */
  function get(id) {
    return scheduled.get(id) || null;
  }

  /** List all scheduled entries, optionally filtered by status. */
  function list(filter = {}) {
    const all = [...scheduled.values()];
    if (filter.status) return all.filter((e) => e.status === filter.status);
    return all;
  }

  /** Pending count. */
  function pendingCount() {
    return list({ status: 'scheduled' }).length;
  }

  return { schedule, cancel, get, list, pendingCount };
}

export default createScheduler;
