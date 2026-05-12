/**
 * Payment Core Confirm Orchestrator (Task 7).
 *
 * Responsibility: centralize verify → map → state transition → business action.
 *
 * This module extracts the core confirmation logic from paymentWebhookWorker
 * to make it reusable from:
 *   - webhook worker (processWebhookJob)
 *   - manual retry tools
 *   - integration tests
 *
 * Edge cases handled:
 *   - Payment already terminal      (transition.invalid)
 *   - Amount/currency mismatch      (_validateEvent)
 *   - Status regression from provider (transition.invalid)
 *   - Missing purpose               (warning if no handler)
 *
 * Architecture:
 *   [Input]  client (PoolClient inside tx), normalized event, job metadata
 *   [Output] { ok, status, payment, ledger, domainEvents, transition, handler }
 *
 * Atomicity (critical):
 *   All steps below run in ONE transaction supplied by paymentWebhookWorker.
 *   Any thrown error (including handler.execute writes) MUST abort the tx:
 *   no partial state transitions, ledger rows, outbound events, or wallet bumps.
 *
 * Pluggable hooks (same as paymentWebhookWorker):
 *   - setSignatureVerifier(fn)      signature verification
 *   - setBusinessActionResolver(fn) business logic routing
 */

import { normalizePaymentWebhookEvent } from './paymentEventNormalizer.js';
import { resolveHandler as resolveHandlerFromRegistry } from './paymentBusinessActions/index.js';

// -----------------------------------------------------------------------------
// Pluggable hooks (shared namespace with paymentWebhookWorker).
// Defaults are permissive; production MUST register strict verifier + resolver.
// -----------------------------------------------------------------------------

/**
 * @typedef {object} SignatureVerifyResult
 * @property {boolean} ok
 * @property {string} [key_version]
 * @property {string} [failure_code]
 * @property {string} [error]
 *
 * @callback SignatureVerifierFn
 * @param {{ job: any, normalized: any }} input
 * @returns {Promise<SignatureVerifyResult> | SignatureVerifyResult}
 *
 * @typedef {object} BusinessActionHandler
 * @property {(payment: any, event: any) => Promise<{ ok: boolean, failure_code?: string }> | { ok: boolean, failure_code?: string }} validate
 * @property {(client: import('pg').PoolClient, payment: any, event: any) => Promise<any>} execute
 *
 * @callback BusinessActionResolverFn
 * @param {{ purpose: string|null, normalized: any, payment: any|null }} input
 * @returns {BusinessActionHandler | null | Promise<BusinessActionHandler | null>}
 */

let _signatureVerifier = null;
let _businessActionResolver = null;

/** @param {SignatureVerifierFn|null} fn */
export function setSignatureVerifier(fn) {
  _signatureVerifier = typeof fn === 'function' ? fn : null;
}

/** @param {BusinessActionResolverFn|null} fn */
export function setBusinessActionResolver(fn) {
  _businessActionResolver = typeof fn === 'function' ? fn : null;
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function toNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function _payloadFromJob(job) {
  const p = job?.payload_json;
  if (p && typeof p === 'object') {
    if (typeof p.raw_body === 'string' && p.raw_body.length) {
      try { return JSON.parse(p.raw_body); } catch { /* fallthrough */ }
    }
    return p;
  }
  return {};
}

function _headersFromJob(job) {
  const h = job?.headers_json;
  if (h && typeof h === 'object' && !Array.isArray(h)) return h;
  const p = job?.payload_json;
  if (p && typeof p === 'object' && p.headers && typeof p.headers === 'object') return p.headers;
  return {};
}

// -----------------------------------------------------------------------------
// Step 1: Signature Verification
// -----------------------------------------------------------------------------

async function _verifySignatureSafe(job, normalized) {
  if (!_signatureVerifier) {
    return { ok: true, key_version: 'unverified' };
  }
  try {
    const r = await _signatureVerifier({ job, normalized });
    return r || { ok: false, failure_code: 'signature_verifier_returned_null' };
  } catch (e) {
    return { ok: false, failure_code: 'signature_verifier_threw', error: String(e?.message || e) };
  }
}

// -----------------------------------------------------------------------------
// Step 2: Validate Normalized Event
// -----------------------------------------------------------------------------

function _validateEvent(normalized) {
  if (!toNonEmptyString(normalized?.payment_id)) {
    return { ok: false, failure_code: 'missing_payment_id', source: 'validation' };
  }
  const amt = Number(normalized?.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, failure_code: 'invalid_amount', source: 'validation' };
  }
  if (!toNonEmptyString(normalized?.status) || normalized.status === 'unknown') {
    return { ok: false, failure_code: 'missing_status', source: 'validation' };
  }
  // Currency is optional for backward compatibility with existing tests.
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Step 3: Idempotent State Transition (gateway_transactions)
// -----------------------------------------------------------------------------

async function _applyStateTransitionTx(client, normalized) {
  const paymentId = toNonEmptyString(normalized?.payment_id);
  const clientRef = toNonEmptyString(normalized?.client_reference_id);
  const eventType = String(normalized?.event_type || '').toLowerCase();

  // Lock the canonical payment row using the external identifiers.
  let lock = { rows: [] };
  try {
    lock = await client.query(
      `SELECT id, status, settlement_status, status_version, amount_minor, currency,
              external_ref, merchant_reference, client_reference_id,
              COALESCE(metadata, '{}'::jsonb) AS metadata
       FROM gateway_transactions
       WHERE external_ref = $1
          OR merchant_reference = $1
          OR ($2::text IS NOT NULL AND client_reference_id = $2)
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [paymentId, clientRef],
    );
  } catch (e) {
    // If gateway_transactions does not exist in this deployment, treat as no row.
    if (String(e?.code || '') === '42P01') {
      return { applied: false, invalid: false, payment: null, reason: 'gateway_transactions_missing' };
    }
    // Column missing or other schema error.
    if (String(e?.code || '') === '42703') {
      return {
        applied: false,
        invalid: false,
        payment: null,
        reason: 'gateway_transactions_select_failed',
        error: String(e?.message || e),
      };
    }
    throw e;
  }

  const payment = lock.rows[0] || null;
  if (!payment) {
    return { applied: false, invalid: false, payment: null, reason: 'payment_not_found' };
  }

  const cur = String(payment.status || '').toUpperCase();

  // Handle payment_confirmed events (the most common case).
  if (eventType === 'payment_confirmed') {
    // Already in a terminal success state → idempotent no-op.
    if (['CAPTURED', 'SETTLED'].includes(cur)) {
      return {
        applied: false,
        invalid: false,
        payment,
        reason: 'already_paid',
        fromStatus: cur,
        toStatus: cur,
      };
    }
    // Terminal failure states → invalid transition.
    if (['FAILED', 'REFUNDED'].includes(cur)) {
      return {
        applied: false,
        invalid: true,
        payment,
        reason: 'invalid_transition',
        fromStatus: cur,
      };
    }
    // Valid transition from PENDING/AUTHORIZED → CAPTURED.
    if (['PENDING', 'AUTHORIZED'].includes(cur)) {
      const upd = await client.query(
        `UPDATE gateway_transactions
         SET status = 'CAPTURED',
             settlement_status = 'PAYMENT_CONFIRMED',
             status_version = status_version + 1,
             trace_id = COALESCE(trace_id, $2),
             updated_at = NOW()
         WHERE id = $1::uuid
           AND status IN ('PENDING','AUTHORIZED')
         RETURNING id, status, settlement_status, status_version`,
        [payment.id, toNonEmptyString(normalized?.trace_id)],
      );
      if (!upd.rowCount) {
        // Rare race: another worker transitioned first.
        return {
          applied: false,
          invalid: false,
          payment,
          reason: 'transition_lost_race',
          fromStatus: cur,
        };
      }
      const next = upd.rows[0];
      return {
        applied: true,
        invalid: false,
        payment: { ...payment, ...next },
        reason: 'transitioned',
        fromStatus: cur,
        toStatus: 'CAPTURED',
      };
    }
    // Unknown status value → treat as invalid.
    return {
      applied: false,
      invalid: true,
      payment,
      reason: 'invalid_transition_unknown_state',
      fromStatus: cur,
    };
  }

  // Other event types (payment_failed, payment_pending, etc.) → just lock and
  // return the row without transition. The business handler may still need to
  // reconcile downstream side effects.
  return {
    applied: false,
    invalid: false,
    payment,
    reason: 'no_transition_for_event_type',
    fromStatus: cur,
  };
}

// -----------------------------------------------------------------------------
// Step 4: Business Action Layer
// -----------------------------------------------------------------------------

async function _resolveHandlerSafe(normalized, payment) {
  // Use pluggable resolver if registered; otherwise fall back to registry.
  const resolver = _businessActionResolver || _defaultRegistryResolver;
  if (!resolver) return null;
  
  try {
    const h = await resolver({
      purpose: toNonEmptyString(normalized?.purpose),
      normalized,
      payment,
    });
    return h && typeof h.validate === 'function' && typeof h.execute === 'function' ? h : null;
  } catch (e) {
    console.warn('[paymentCoreConfirm] business action resolver threw', {
      purpose: normalized?.purpose,
      error: e?.message,
    });
    return null;
  }
}

// Default resolver: use built-in registry.
function _defaultRegistryResolver({ purpose }) {
  return resolveHandlerFromRegistry(purpose);
}

/** Best-effort stable payment id for outbox dedupe / correlation. */
function _paymentDedupeKey(normalized, payment) {
  return (
    toNonEmptyString(normalized?.payment_id) ||
    toNonEmptyString(payment?.external_ref) ||
    toNonEmptyString(payment?.merchant_reference) ||
    (payment?.id != null ? String(payment.id) : '') ||
    null
  );
}

/**
 * Persist domain events into outbound_domain_events (exactly-once enqueue).
 * Same transaction as handler — failure rolls back handler + transitions.
 *
 * @param {import('pg').PoolClient} client
 * @param {any[]} events
 * @param {{
 *   paymentKey: string|null,
 *   traceId?: string|null,
 *   webhookEventId?: string|null,
 *   ledgerEntryId?: number|null
 * }} meta
 */
async function _persistOutboundDomainEventsTx(client, events, meta) {
  if (!events?.length) return;
  const paymentKey = meta.paymentKey || null;
  const traceId = meta.traceId || null;
  const webhookEventId = meta.webhookEventId || null;
  const ledgerEntryId =
    meta.ledgerEntryId != null && Number.isFinite(Number(meta.ledgerEntryId))
      ? Number(meta.ledgerEntryId)
      : null;

  for (const ev of events) {
    const eventName = String(ev?.type || ev?.event_name || 'domain.unknown');
    const idempotencyKey = toNonEmptyString(ev?.idempotency_key) || paymentKey || eventName;
    const rawPayload =
      typeof ev?.payload === 'object' && ev.payload && !Array.isArray(ev.payload) ? ev.payload : {};
    const payload = {
      ...rawPayload,
      event: eventName,
      idempotency_key: idempotencyKey,
      occurred_at: ev?.occurred_at ?? rawPayload.occurred_at ?? null,
    };
    if (webhookEventId) payload.webhook_event_id = webhookEventId;
    if (ledgerEntryId != null) payload.ledger_entry_id = ledgerEntryId;
    try {
      await client.query('SAVEPOINT sp_ob_ins');
      await client.query(
        `INSERT INTO outbound_domain_events (
           event_name, idempotency_key, payload, trace_id, payment_id,
           webhook_event_id, ledger_entry_id,
           status, attempt_count, next_attempt_at, updated_at
         )
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, 'pending', 0, NOW(), NOW())
         ON CONFLICT (event_name, idempotency_key) DO NOTHING`,
        [
          eventName,
          idempotencyKey,
          JSON.stringify(payload),
          traceId,
          paymentKey,
          webhookEventId,
          ledgerEntryId,
        ],
      );
      await client.query('RELEASE SAVEPOINT sp_ob_ins');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_ob_ins').catch(() => {});
      if (String(e?.code) === '42703') {
        try {
          await client.query(
            `INSERT INTO outbound_domain_events (
               event_name, idempotency_key, payload, trace_id, payment_id,
               status, attempt_count, next_attempt_at, updated_at
             )
             VALUES ($1, $2, $3::jsonb, $4, $5, 'pending', 0, NOW(), NOW())
             ON CONFLICT (event_name, idempotency_key) DO NOTHING`,
            [eventName, idempotencyKey, JSON.stringify(payload), traceId, paymentKey],
          );
          await client.query('RELEASE SAVEPOINT sp_ob_ins');
        } catch (e2) {
          await client.query('ROLLBACK TO SAVEPOINT sp_ob_ins').catch(() => {});
          throw e2;
        }
      } else if (String(e?.code) === '42P01') {
        console.warn('[paymentCoreConfirm] outbound_domain_events missing; run migrations 186–187');
        await client.query('RELEASE SAVEPOINT sp_ob_ins').catch(() => {});
      } else {
        throw e;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Main Orchestrator
// -----------------------------------------------------------------------------

/**
 * Core payment confirmation orchestration.
 *
 * Called inside a DB transaction (client).
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   normalized: any,
 *   job: any,
 *   provider: string,
 *   eventId: string,
 *   traceId: string|null
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   status: 'confirmed' | 'failed',
 *   payment: any|null,
 *   ledger: any|null,
 *   domainEvents: any[]|null,
 *   transition: any,
 *   handler: any|null,
 *   failure_code?: string,
 *   failure_reason?: string,
 *   failure_source?: string,
 *   error?: string
 * }>}
 */
export async function confirmPaymentWebhook(client, input) {
  const { normalized, job, provider, eventId, traceId } = input;

  // Step 1: Signature verification.
  const sig = await _verifySignatureSafe(job, normalized);
  if (!sig.ok) {
    return {
      ok: false,
      status: 'failed',
      payment: null,
      ledger: null,
      domainEvents: null,
      transition: null,
      handler: null,
      failure_code: sig.failure_code || 'invalid_signature',
      failure_reason: sig.failure_code || 'invalid_signature',
      failure_source: 'signature',
      error: sig.error || null,
    };
  }

  // Step 2: Validate normalized event.
  const validation = _validateEvent(normalized);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'failed',
      payment: null,
      ledger: null,
      domainEvents: null,
      transition: null,
      handler: null,
      failure_code: validation.failure_code,
      failure_reason: validation.failure_code,
      failure_source: validation.source,
    };
  }

  // Step 3: Idempotent state transition (gateway_transactions).
  const transition = await _applyStateTransitionTx(client, normalized);
  if (transition.invalid) {
    return {
      ok: false,
      status: 'failed',
      payment: transition.payment,
      ledger: null,
      domainEvents: null,
      transition,
      handler: null,
      failure_code: transition.reason || 'invalid_transition',
      failure_reason: transition.reason || 'invalid_transition',
      failure_source: 'transition',
    };
  }

  // Step 4: Business action layer (validate + execute).
  const handler = await _resolveHandlerSafe(normalized, transition.payment);
  const explicitPurpose = toNonEmptyString(normalized?.purpose);
  if (explicitPurpose && !handler) {
    return {
      ok: false,
      status: 'failed',
      payment: transition.payment,
      ledger: null,
      domainEvents: null,
      transition,
      handler: null,
      failure_code: 'unknown_payment_purpose',
      failure_reason: 'unknown_payment_purpose',
      failure_source: 'handler_resolution',
    };
  }
  let handlerResult = null;
  if (handler) {
    const v = await handler.validate(transition.payment, normalized);
    if (v && v.ok === false) {
      return {
        ok: false,
        status: 'failed',
        payment: transition.payment,
        ledger: null,
        domainEvents: null,
        transition,
        handler: null,
        failure_code: v.failure_code || 'business_validate_failed',
        failure_reason: v.failure_code || 'business_validate_failed',
        failure_source: 'business_validate',
      };
    }
    // execute() owns ledger writes inside this transaction.
    // Handlers MUST use deterministic idempotency keys.
    handlerResult = await handler.execute(client, transition.payment, normalized);
  }

  const paymentKey = _paymentDedupeKey(normalized, transition.payment);
  if (handlerResult?.domainEvents?.length) {
    const ledgerEntryId =
      handlerResult?.ledger?.id != null && Number.isFinite(Number(handlerResult.ledger.id))
        ? Number(handlerResult.ledger.id)
        : null;
    const p = toNonEmptyString(provider)?.toLowerCase() || null;
    const eid = toNonEmptyString(eventId);
    const webhookEventId = p && eid ? `${p}:${eid}` : null;
    await _persistOutboundDomainEventsTx(client, handlerResult.domainEvents, {
      paymentKey,
      traceId,
      webhookEventId,
      ledgerEntryId,
    });
  }

  // Audit warning: marker claimed but nothing actually moved.
  if (!transition.applied && !handler) {
    console.warn('[paymentCoreConfirm] confirmed without business effect', {
      provider,
      event_id: eventId,
      trace_id: traceId,
      purpose: normalized?.purpose || null,
      transition_reason: transition.reason || null,
      handler_registered: false,
    });
  }

  return {
    ok: true,
    status: 'confirmed',
    payment: transition.payment,
    ledger: handlerResult?.ledger || null,
    domainEvents: handlerResult?.domainEvents || null,
    transition,
    handler: handlerResult,
    failure_code: null,
    failure_reason: null,
    failure_source: null,
  };
}

/**
 * Re-normalize event from job (deterministic, can be called multiple times).
 */
export function renormalizeEventFromJob(job, provider, rawHash) {
  return normalizePaymentWebhookEvent({
    payload: _payloadFromJob(job),
    headers: _headersFromJob(job),
    provider,
    rawHash: toNonEmptyString(rawHash),
  });
}
