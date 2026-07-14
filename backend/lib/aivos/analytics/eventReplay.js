/**
 * Event Replay – reprocesses stored analytics events through a handler chain.
 *
 * Use cases:
 *  - Re-derive KPIs after a calculation bug fix
 *  - Backfill new metric types from existing event data
 *  - Audit trails: replay a specific job's events in order
 */
export function createEventReplay(deps = {}) {
  const storage = deps.storage;
  if (!storage) throw new Error('event_replay_requires_storage');

  /**
   * Replay events matching a filter through one or more handler functions.
   *
   * @param {Function[]} handlers   Each handler receives (event, ctx) and may be async
   * @param {{ type?, jobId?, platform?, from?, to? }} filter
   * @returns {Promise<{ replayed: number, errors: object[] }>}
   */
  async function replay(handlers = [], filter = {}) {
    const events = storage.query(filter).sort((a, b) => a.ts.localeCompare(b.ts));
    const errors = [];
    let replayed = 0;

    for (const event of events) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (e) {
          errors.push({ eventId: event.id, type: event.type, error: e.message });
        }
      }
      replayed += 1;
    }

    return { replayed, errors };
  }

  /**
   * Replay events for a single job.
   */
  async function replayJob(jobId, handlers = []) {
    return replay(handlers, { jobId });
  }

  /**
   * Dry-run replay: collect events without calling handlers.
   * @returns {{ events: object[], count: number }}
   */
  function dryRun(filter = {}) {
    const events = storage.query(filter).sort((a, b) => a.ts.localeCompare(b.ts));
    return { events, count: events.length };
  }

  return { replay, replayJob, dryRun };
}

export default createEventReplay;
