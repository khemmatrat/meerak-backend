/**
 * Phase 10.5 + 11 — V1 → V2 Integration Bridge (Shadow + Live).
 *
 * Connects ALL production events to V2 shadow intelligence pipeline
 * WITHOUT modifying production response or behavior.
 *
 * Uses singleton shadow infrastructure from runtimeShadowInfra.js.
 * No per-request bootstrap — one tenant, one meter, reused forever.
 *
 * Supported events: signup, login, kyc, job_apply, payment
 *
 * SAFETY CONTRACT:
 * - NEVER modifies V1 response
 * - NEVER blocks V1 flow
 * - ALL calls are try/catch wrapped (fail-open)
 * - NO database access, NO network calls
 * - PII stripped before processing
 */

import { createIntentEnvelope } from './intentContractLayer.js';
import { getShadowInfra } from './runtimeShadowInfra.js';
import { recordRuntimeUsage } from './runtimeUsageMeter.js';
import { createAuditLedgerEntry } from './runtimeAuditLedger.js';
import { registerProvenanceNode } from './runtimeEventProvenanceGraph.js';

export const BRIDGE_VERSION = 'integration_bridge_v3';

function _safe(fn) {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; }
}

const EVENT_TO_INTENT = Object.freeze({
  signup: 'user.signup',
  login: 'user.login',
  kyc: 'workflow.execute',
  job_apply: 'workflow.execute',
  payment: 'payment.capture',
});

function _maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  return s.length > 4 ? s.slice(0, 4) + '****' : '****';
}

/**
 * Map a V1 signup request to a V2 intent structure (backward-compat).
 */
export function mapSignupToIntent(v1Request = {}) {
  return mapEventToIntent('signup', v1Request);
}

/**
 * Map any V1 event to a V2 intent structure.
 * Strips PII — only captures event shape and metadata.
 *
 * @param {string} eventType — signup | login | kyc | job_apply | payment
 * @param {object} v1Payload — sanitized request data
 * @returns {object} — intent input suitable for createIntentEnvelope
 */
export function mapEventToIntent(eventType, v1Payload = {}) {
  const intentType = EVENT_TO_INTENT[eventType] || 'workflow.execute';

  const base = {
    intent_type: intentType,
    governance: { mode: 'simulation' },
    execution_constraints: { replay_safe: true },
  };

  switch (eventType) {
    case 'signup':
      base.payload = {
        phone: _maskPhone(v1Payload.phone),
        role: v1Payload.role || 'user',
        source: 'v1_bridge',
        event: 'signup',
        has_referral: !!(v1Payload.referral_code || v1Payload.ref || v1Payload.referralCode),
      };
      break;

    case 'login':
      base.payload = {
        phone: _maskPhone(v1Payload.phone),
        source: 'v1_bridge',
        event: 'login',
        method: v1Payload.method || 'otp',
      };
      break;

    case 'kyc':
      base.payload = {
        source: 'v1_bridge',
        event: 'kyc',
        doc_type: v1Payload.document_type || v1Payload.doc_type || 'unknown',
        workflow_name: 'kyc_submission',
      };
      break;

    case 'job_apply':
      base.payload = {
        source: 'v1_bridge',
        event: 'job_apply',
        has_job_id: !!v1Payload.job_id,
        workflow_name: 'job_application',
      };
      break;

    case 'payment':
      base.payload = {
        source: 'v1_bridge',
        event: 'payment',
        has_amount: !!v1Payload.amount,
        currency: v1Payload.currency || 'THB',
        workflow_name: 'payment_capture',
      };
      break;

    default:
      base.payload = { source: 'v1_bridge', event: eventType || 'unknown' };
  }

  return base;
}

/**
 * Shadow-process a V1 signup event (backward-compat wrapper).
 */
export function processSignupShadow(v1Request = {}, options = {}) {
  return processEventShadow('signup', v1Request, options);
}

/**
 * Shadow-process any V1 event through the full V2 pipeline.
 * Uses singleton shadow infra — no bootstrap, no registration per request.
 *
 * @param {string} eventType — signup | login | kyc | job_apply | payment
 * @param {object} v1Payload — sanitized event data
 * @param {object} [options] — unused, kept for backward-compat
 * @returns {object} — shadow processing result (never throws)
 */
export function processEventShadow(eventType, v1Payload = {}, options = {}) {
  const results = { shadow_processed: false, event_type: eventType, steps: {} };

  try {
    const infra = getShadowInfra();
    if (!infra) {
      results.reason = 'shadow_infra_unavailable';
      return results;
    }

    const tenantId = infra.tenant_id;
    const namespace = infra.namespace;

    // 1. Create intent envelope
    const intentInput = mapEventToIntent(eventType, v1Payload);
    const envelope = _safe(() => createIntentEnvelope(intentInput));
    results.steps.intent = envelope.ok ? 'created' : `skipped: ${envelope.error}`;

    if (!envelope.ok) {
      results.reason = 'intent_creation_failed';
      return results;
    }

    const intentId = envelope.value.intent_id;
    const intentHash = envelope.value.intent_hash;

    // 2. Record usage
    const usage = _safe(() => recordRuntimeUsage({
      tenant_id: tenantId,
      event_type: 'request',
    }));
    results.steps.usage = usage.ok ? 'recorded' : `skipped: ${usage.error}`;

    // 3. Audit ledger
    const audit = _safe(() => createAuditLedgerEntry({
      tenant_id: tenantId,
      namespace,
      evidence_type: 'sdk_invocation',
      source_id: intentId,
      source_hash: intentHash,
      governance_mode: 'simulation',
    }));
    results.steps.audit = audit.ok ? 'recorded' : `skipped: ${audit.error}`;

    // 4. Provenance graph
    const provenance = _safe(() => registerProvenanceNode({
      tenant_id: tenantId,
      namespace,
      event_type: `${eventType}_shadow`,
      event_id: `bridge_${intentId}`,
      source_layer: 'gateway',
      source_hash: intentHash,
    }));
    results.steps.provenance = provenance.ok ? 'registered' : `skipped: ${provenance.error}`;

    results.shadow_processed = true;
    results.intent_id = intentId;
    results.intent_hash = intentHash;
    results.execution_allowed = false;
  } catch (err) {
    results.shadow_processed = false;
    results.error = err.message;
  }

  return results;
}
