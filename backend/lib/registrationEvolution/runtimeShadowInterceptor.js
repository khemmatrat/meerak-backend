/**
 * Phase 10.5 + 11 — Shadow Event Interceptor (All V1 Events → V2).
 *
 * Intercepts production events (signup, login, kyc, job_apply, payment)
 * and routes them to the V2 shadow pipeline via processEventShadow.
 * Never blocks, never mutates response.
 *
 * SAFETY CONTRACT:
 * - Express middleware: always calls next()
 * - All interception is fire-and-forget via setImmediate
 * - Every call path is try/catch wrapped
 * - Feature-flagged: ENABLE_SIGNUP_SHADOW_BRIDGE
 * - PII stripped before forwarding
 */

import { processEventShadow } from './runtimeSignupIntegrationBridge.js';

export const INTERCEPTOR_VERSION = 'shadow_interceptor_v2';

const SHADOW_EVENTS = Object.freeze(new Set([
  'signup', 'login', 'kyc', 'job_apply', 'payment',
]));

const PATH_EVENT_MAP = Object.freeze([
  { match: '/api/auth/register', event: 'signup' },
  { match: '/api/auth/login', event: 'login' },
  { match: '/api/kyc/submit', event: 'kyc' },
  { match: '/api/kyc/', event: 'kyc', method: 'POST' },
  { match: '/api/jobs', event: 'job_apply', method: 'POST' },
  { match: '/api/payments/create-intent', event: 'payment' },
  { match: '/api/payments/', event: 'payment', method: 'POST' },
]);

let _interceptCount = 0;
let _errorCount = 0;
const _eventCounts = { signup: 0, login: 0, kyc: 0, job_apply: 0, payment: 0 };

/**
 * Intercept a V1 event and route to shadow pipeline.
 */
export function interceptEvent(eventType, payload = {}) {
  if (!SHADOW_EVENTS.has(eventType)) {
    return { ignored: true, eventType };
  }

  try {
    const result = processEventShadow(eventType, payload, {
      tenant_id: payload.tenant_id || 'shadow_global',
      namespace: payload.namespace || 'shadow',
    });
    _interceptCount++;
    _eventCounts[eventType] = (_eventCounts[eventType] || 0) + 1;
    return { intercepted: true, eventType, shadow: result };
  } catch (_) {
    _errorCount++;
    return { intercepted: false, eventType, error: 'bridge_failed' };
  }
}

/**
 * Sanitize request body — strip sensitive fields, mask PII.
 */
function _sanitize(body = {}, path = '') {
  return {
    phone: body.phone ? String(body.phone).slice(0, 4) + '****' : null,
    role: body.role || null,
    method: body.method || null,
    document_type: body.document_type || body.doc_type || null,
    job_id: body.job_id ? 'present' : null,
    amount: body.amount ? 'present' : null,
    currency: body.currency || null,
    referral_code: body.referral_code ? 'present' : null,
    path,
  };
}

/**
 * Express middleware — attaches shadow observation to matching routes.
 * Feature-gated by ENABLE_SIGNUP_SHADOW_BRIDGE env var.
 */
export function createShadowMiddleware() {
  return (req, res, next) => {
    try {
      if (process.env.ENABLE_SIGNUP_SHADOW_BRIDGE !== '1' && process.env.ENABLE_SIGNUP_SHADOW_BRIDGE !== 'true') {
        return next();
      }

      const method = (req.method || '').toUpperCase();
      const path = req.path || '';

      for (const rule of PATH_EVENT_MAP) {
        if (!path.includes(rule.match)) continue;
        if (rule.method && method !== rule.method) continue;

        setImmediate(() => {
          try {
            interceptEvent(rule.event, _sanitize(req.body, path));
          } catch (_) { /* fail-open */ }
        });
        break;
      }
    } catch (_) { /* fail-open */ }

    next();
  };
}

/**
 * Get interceptor statistics (for activation verification).
 */
export function getInterceptorStats() {
  return {
    total_intercepted: _interceptCount,
    total_errors: _errorCount,
    error_rate: _interceptCount > 0 ? _errorCount / (_interceptCount + _errorCount) : 0,
    by_event: { ..._eventCounts },
    version: INTERCEPTOR_VERSION,
  };
}
