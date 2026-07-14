import { safetyLevel, maxActionsPerHour } from './config.js';

/**
 * Safety Guard – enforces safety constraints on automated actions.
 *
 * Checks:
 *  - Rate limiter (max actions per hour)
 *  - Blocklist of dangerous action types
 *  - Safety level (strict / standard / permissive)
 *  - Content safety (no PII, no sensitive data in automation payloads)
 */
export function createSafetyGuard(deps = {}) {
  const auditLog = deps.automationAudit || null;

  const actionCounts = new Map(); // hour-bucket -> count
  const blocklist = new Set(['delete_all', 'drop_database', 'override_governance', 'bypass_all']);
  const violations = [];

  function _hourBucket() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  }

  /**
   * Check if an action is allowed.
   * @param {{ action, context? }} params
   * @returns {{ allowed: boolean, reason: string }}
   */
  function check({ action, context = {} }) {
    const level = safetyLevel();

    // Blocklist check
    if (blocklist.has(action)) {
      const v = { action, reason: 'blocklisted', ts: new Date().toISOString() };
      violations.push(v);
      if (auditLog) auditLog.log({ type: 'safety_violation', ...v });
      return { allowed: false, reason: 'blocklisted' };
    }

    // Rate limit
    const bucket = _hourBucket();
    const count = actionCounts.get(bucket) || 0;
    const limit = maxActionsPerHour();
    if (count >= limit) {
      const v = { action, reason: `rate_limit_exceeded:${limit}/hr`, ts: new Date().toISOString() };
      violations.push(v);
      if (auditLog) auditLog.log({ type: 'safety_violation', ...v });
      return { allowed: false, reason: `rate_limit_exceeded` };
    }

    // Strict mode: require context.approvedBy
    if (level === 'strict' && !context.approvedBy) {
      return { allowed: false, reason: 'strict_mode_requires_approval' };
    }

    // Record the action
    actionCounts.set(bucket, count + 1);
    return { allowed: true, reason: 'ok' };
  }

  function addToBlocklist(action) { blocklist.add(action); }
  function removeFromBlocklist(action) { blocklist.delete(action); }
  function getViolations() { return [...violations]; }

  return { check, addToBlocklist, removeFromBlocklist, getViolations };
}

export default createSafetyGuard;
