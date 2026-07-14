import { randomUUID } from 'crypto';

/**
 * Publish Queue – manages async publish job lifecycle.
 *
 * In-process execution when no Bull queue is provided (tests / dev).
 * Accepts retry policy: maxAttempts + backoffMs.
 */
export function createPublishQueue(deps = {}) {
  const publishService = deps.publishService || null;
  const bullQueue = deps.bullQueue || null;
  const maxAttempts = deps.maxAttempts || 3;
  const backoffMs = deps.backoffMs || 1000;

  const entries = new Map();
  const results = new Map();

  /**
   * Enqueue a publish job.
   * @param {{ jobId: string, artifact: object, platforms: string[], options?: object }} params
   */
  async function enqueue({ jobId, artifact, platforms = [], options = {} }) {
    const queueJobId = randomUUID();
    const entry = {
      queueJobId,
      jobId,
      artifact,
      platforms,
      options,
      status: 'pending',
      attempts: 0,
      enqueued_at: new Date().toISOString(),
      bull_job_id: null,
    };
    entries.set(queueJobId, entry);

    if (bullQueue) {
      try {
        const bJob = await bullQueue.add(
          { jobId, artifact, platforms, options },
          {
            jobId: queueJobId,
            attempts: maxAttempts,
            backoff: { type: 'exponential', delay: backoffMs },
          },
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

    // In-process: execute with retry
    return _executeWithRetry(entry);
  }

  async function _executeWithRetry(entry) {
    if (!publishService) {
      entry.status = 'failed';
      entry.error = 'publish_service_not_injected';
      return { queued: false, queueJobId: entry.queueJobId, error: entry.error };
    }

    entry.status = 'running';
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      entry.attempts = attempt;
      try {
        const result = await publishService.publish(
          entry.jobId,
          entry.artifact,
          entry.platforms,
          entry.options,
        );
        entry.status = 'done';
        entry.completed_at = new Date().toISOString();
        results.set(entry.queueJobId, result);
        return { queued: true, queueJobId: entry.queueJobId, result };
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, Math.min(backoffMs * attempt, 5000)));
        }
      }
    }

    entry.status = 'failed';
    entry.error = lastError?.message || 'unknown';
    return { queued: false, queueJobId: entry.queueJobId, error: entry.error };
  }

  function getStatus(queueJobId) {
    const entry = entries.get(queueJobId);
    if (!entry) return { found: false };
    return {
      found: true,
      ...entry,
      result: results.get(queueJobId) || null,
    };
  }

  function list(filter = {}) {
    const all = [...entries.values()];
    if (filter.status) return all.filter((e) => e.status === filter.status);
    return all;
  }

  return { enqueue, getStatus, list };
}

export default createPublishQueue;
