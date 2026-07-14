/**
 * Auto Retry – automatically retries failed pipeline nodes or publish actions
 * using exponential backoff with jitter.
 */
export function createAutoRetry(deps = {}) {
  const auditLog = deps.automationAudit || null;

  const DEFAULT_OPTS = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true };
  const retries = [];

  /**
   * Execute fn with automatic retry on failure.
   * @param {Function} fn                      – async function to retry
   * @param {object}  opts                     – { maxAttempts, baseDelayMs, maxDelayMs, jitter, id? }
   * @returns {Promise<any>}
   */
  async function withRetry(fn, opts = {}) {
    const { maxAttempts, baseDelayMs, maxDelayMs, jitter, id = 'anon' } = { ...DEFAULT_OPTS, ...opts };
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn(attempt);
        retries.push({ id, attempt, status: 'ok', ts: new Date().toISOString() });
        return result;
      } catch (err) {
        lastError = err;
        retries.push({ id, attempt, status: 'error', error: err.message, ts: new Date().toISOString() });
        if (auditLog) auditLog.log({ type: 'auto_retry', id, attempt, error: err.message });
        if (attempt < maxAttempts) {
          let delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
          if (jitter) delay = delay * (0.5 + Math.random() * 0.5);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  function history() { return [...retries]; }

  return { withRetry, history };
}

export default createAutoRetry;
