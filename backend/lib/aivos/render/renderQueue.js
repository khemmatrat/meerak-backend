import { randomUUID } from 'crypto';

/**
 * Render Queue – manages render job lifecycle.
 *
 * When a Bull queue is injected (deps.bullQueue), jobs are enqueued to Redis.
 * Without Bull (tests / dev), jobs execute inline immediately.
 *
 * Queue entries flow: pending → running → done | failed
 */
export function createRenderQueue(deps = {}) {
  const renderService = deps.renderService;
  const bullQueue = deps.bullQueue || null;

  /** Ordered list of all enqueued entries (in-process store). */
  const entries = new Map();
  const resultStore = new Map();

  /**
   * Enqueue a render job.
   * @param {string} jobId   Runtime job ID
   * @param {object} payload Render payload (input, template, captions, motion, thumbnail, …)
   * @returns {Promise<{ queued: boolean, queueJobId: string, result?: object, error?: string }>}
   */
  async function enqueue(jobId, payload = {}) {
    const queueJobId = randomUUID();
    const entry = {
      queueJobId,
      jobId,
      payload,
      status: 'pending',
      enqueued_at: new Date().toISOString(),
      bull_job_id: null,
    };
    entries.set(queueJobId, entry);

    if (bullQueue) {
      try {
        const bJob = await bullQueue.add(
          { jobId, payload },
          { jobId: queueJobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
        );
        entry.bull_job_id = String(bJob.id);
        entry.status = 'queued';
        return { queued: true, queueJobId, bull_job_id: entry.bull_job_id };
      } catch (e) {
        entry.status = 'failed';
        entry.error = e.message;
        return { queued: false, queueJobId, error: e.message };
      }
    }

    // In-process execution (no Redis) – run immediately and return result
    entry.status = 'running';
    try {
      if (!renderService) throw new Error('render_service_not_injected');
      const result = await renderService.render(jobId, payload);
      entry.status = 'done';
      entry.completed_at = new Date().toISOString();
      resultStore.set(queueJobId, result);
      return { queued: true, queueJobId, result };
    } catch (e) {
      entry.status = 'failed';
      entry.error = e.message;
      return { queued: false, queueJobId, error: e.message };
    }
  }

  /**
   * Get the status and result of a queued job.
   * @param {string} queueJobId
   * @returns {{ found: boolean, status?: string, result?: object, error?: string }}
   */
  function getStatus(queueJobId) {
    const entry = entries.get(queueJobId);
    if (!entry) return { found: false };
    return {
      found: true,
      queueJobId: entry.queueJobId,
      jobId: entry.jobId,
      status: entry.status,
      bull_job_id: entry.bull_job_id,
      enqueued_at: entry.enqueued_at,
      completed_at: entry.completed_at || null,
      result: resultStore.get(queueJobId) || null,
      error: entry.error || null,
    };
  }

  /** List all queue entries (for observability / admin). */
  function list(filter = {}) {
    const all = [...entries.values()];
    if (filter.status) return all.filter((e) => e.status === filter.status);
    return all;
  }

  /** Pending count. */
  function pendingCount() {
    return list({ status: 'pending' }).length + list({ status: 'queued' }).length;
  }

  return { enqueue, getStatus, list, pendingCount };
}

export default createRenderQueue;
