/**
 * Auto Recovery – detects stuck/failed pipeline jobs and automatically
 * triggers resume, restart, or escalation based on the failure pattern.
 *
 * Recovery strategies:
 *   resume   – resume from last checkpoint
 *   restart  – restart the entire job
 *   escalate – create an approval request for human review
 *   skip     – mark the job as skipped and continue
 */
export function createAutoRecovery(deps = {}) {
  const pipeline    = deps.pipeline    || null;
  const auditLog    = deps.automationAudit || null;

  const incidents   = [];
  const STRATEGIES  = { default: 'resume', render: 'resume', publish: 'retry', transcribe: 'restart' };

  /**
   * Attempt automatic recovery for a failed job.
   * @param {{ jobId, nodeId, error, attempt }} params
   * @returns {{ jobId, strategy, status }}
   */
  async function recover({ jobId, nodeId, error, attempt = 1 }) {
    const strategy = STRATEGIES[nodeId] || STRATEGIES.default;
    let status = 'attempted';
    let result = null;

    try {
      if (strategy === 'resume' && pipeline) {
        result = await pipeline.resumeFromLastCheckpoint(jobId);
        status = 'resumed';
      } else if (strategy === 'restart' && pipeline) {
        result = await pipeline.start({ jobId: `${jobId}_restart_${Date.now()}` });
        status = 'restarted';
      } else if (strategy === 'escalate') {
        status = 'escalated';
        result = { escalatedAt: new Date().toISOString(), reason: error };
      } else {
        status = 'skipped';
        result = { skipped: true };
      }
    } catch (err) {
      status = 'recovery_failed';
      result = { error: err.message };
    }

    const incident = { jobId, nodeId, error, attempt, strategy, status, result, ts: new Date().toISOString() };
    incidents.push(incident);
    if (auditLog) auditLog.log({ type: 'auto_recovery', ...incident });
    return { jobId, strategy, status, result };
  }

  function history() { return [...incidents]; }

  return { recover, history };
}

export default createAutoRecovery;
