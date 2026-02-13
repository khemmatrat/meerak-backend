/**
 * Standalone AuditService — Log must not block the main process.
 * - Fire-and-forget: DB insert failure → console.error only, never throw.
 * - Sanitize: mask password, token, secret, credit card before saving.
 * - JSONB changes: { old: {...}, new: {...} } for diff in UI.
 * Use: const audit = createAuditService(pool); audit.log(actorId, action, entityData, context);
 */

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'access_token', 'refresh_token', 'api_key', 'credit_card', 'card_number', 'cvv', 'ssn'];

/**
 * Recursively mask sensitive keys in an object. In place; returns same object.
 * @param {object} obj - Any plain object
 * @returns {object} - Same object with sensitive values replaced by '[REDACTED]'
 */
function maskSensitiveKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => { obj[i] = maskSensitiveKeys(item); });
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lower.includes(k))) {
      obj[key] = '[REDACTED]';
    } else {
      obj[key] = maskSensitiveKeys(obj[key]);
    }
  }
  return obj;
}

/**
 * Deep clone and then mask. Use for building payloads to store (don't mutate caller's objects).
 */
function sanitizeForLog(obj) {
  if (obj === null || obj === undefined) return obj;
  const copy = JSON.parse(JSON.stringify(obj));
  return maskSensitiveKeys(copy);
}

/**
 * @param {import('pg').Pool} pool - PostgreSQL pool
 * @returns {{ log: function }}
 */
function createAuditService(pool) {
  if (!pool) throw new Error('AuditService requires a pg Pool');

  /**
   * Fire-and-forget audit log. Never throws; on DB error only console.error.
   * @param {string} actorId - Who did it (user id)
   * @param {string} action - e.g. PAYMENT_RELEASED, JOB_DELETED, KYC_APPROVED, role_change
   * @param {object} entityData - { entityName, entityId, old?: object, new?: object }
   * @param {object} [context] - { actorRole?: 'Admin'|'User'|'System', status?: 'Success'|'Failed', ipAddress?: string }
   */
  function log(actorId, action, entityData, context = {}) {
    const run = () => {
      try {
        const entityName = entityData?.entityName || entityData?.entity_type || 'unknown';
        const entityId = entityData?.entityId ?? entityData?.entity_id ?? '';
        const oldVal = sanitizeForLog(entityData?.old ?? entityData?.state_before ?? {});
        const newVal = sanitizeForLog(entityData?.new ?? entityData?.state_after ?? {});
        const changes = JSON.stringify({ old: oldVal, new: newVal });
        const actorRole = (context.actorRole || context.actor_role || 'User').replace(/^user$/i, 'User').replace(/^admin$/i, 'Admin');
        const status = (context.status === 'Failed' ? 'Failed' : 'Success');
        const ipAddress = context.ipAddress ?? context.ip_address ?? null;

        pool.query(
          `INSERT INTO audit_log (actor_id, actor_role, action, entity_name, entity_id, changes, status, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
          [String(actorId), actorRole, String(action), String(entityName), String(entityId), changes, status, ipAddress],
          (err) => {
            if (err) console.error('[AuditService] insert failed:', err.message);
          }
        );
      } catch (e) {
        console.error('[AuditService] log error:', e.message);
      }
    }

    setImmediate(run);
  }

  return { log, maskSensitiveKeys, sanitizeForLog };
}

export { createAuditService, maskSensitiveKeys, sanitizeForLog };
