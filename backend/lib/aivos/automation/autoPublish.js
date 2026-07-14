import { isAutoPublishEnabled } from './config.js';

/**
 * Auto Publish – automatically publishes approved content without manual intervention.
 *
 * Guards:
 *  - Feature flag: AIVOS_AUTO_PUBLISH must be '1'
 *  - Safety guard must approve the publish
 *  - Constraint engine must allow the action
 */
export function createAutoPublish(deps = {}) {
  const publishEngine     = deps.publishEngine     || null;
  const safetyGuard       = deps.safetyGuard       || null;
  const constraintEngine  = deps.constraintEngine  || null;
  const auditLog          = deps.automationAudit   || null;

  const queue   = [];
  const history = [];

  /**
   * Queue a job for auto-publishing.
   * @param {{ jobId, artifact, platforms, options? }} params
   */
  function enqueue(params) {
    queue.push({ ...params, queuedAt: new Date().toISOString(), attempts: 0 });
  }

  /** Drain the queue – publish all queued items that pass guards. */
  async function drain() {
    if (!isAutoPublishEnabled()) return { skipped: true, reason: 'auto_publish_disabled' };
    const results = [];
    while (queue.length > 0) {
      const item = queue.shift();

      // Safety guard check
      if (safetyGuard) {
        const safe = safetyGuard.check({ action: 'auto_publish', context: item });
        if (!safe.allowed) {
          const entry = { ...item, status: 'blocked_safety', reason: safe.reason };
          history.push(entry);
          if (auditLog) auditLog.log({ type: 'auto_publish_blocked', ...entry });
          results.push(entry);
          continue;
        }
      }

      // Constraint check
      if (constraintEngine) {
        const { allowed, violations } = constraintEngine.validate({ action: 'publish', context: item });
        if (!allowed) {
          const entry = { ...item, status: 'constraint_violation', violations };
          history.push(entry);
          results.push(entry);
          continue;
        }
      }

      let publishResult;
      try {
        if (publishEngine) {
          publishResult = await publishEngine.service.publish(item.jobId, item.artifact || {}, item.platforms || [], item.options || {});
        } else {
          publishResult = { stub: true, jobId: item.jobId };
        }
        const entry = { ...item, status: 'published', publishResult, publishedAt: new Date().toISOString() };
        history.push(entry);
        if (auditLog) auditLog.log({ type: 'auto_published', jobId: item.jobId });
        results.push(entry);
      } catch (err) {
        const entry = { ...item, status: 'error', error: err.message };
        history.push(entry);
        results.push(entry);
      }
    }
    return { processed: results.length, results };
  }

  function getHistory() { return [...history]; }
  function getQueue()   { return [...queue]; }

  return { enqueue, drain, getHistory, getQueue };
}

export default createAutoPublish;
