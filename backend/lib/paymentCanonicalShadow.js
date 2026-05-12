/**
 * Task 19C: canonical shadow read verification (READ-ONLY).
 * Compares dual-written canonical rows (payments + payment_attempts + payment_status_transitions)
 * against legacy gateway + projection + presenter evidence. No writes, no response mutation.
 *
 * Canonical derivation uses payments + attempts + transitions only (ordered by id ASC).
 * gateway_transactions remains authoritative store for authored gateway snapshots;
 * canonical-first overlays for reads are gated (PAYMENT_CANONICAL_READS / PAYMENT_INTENT_CUTOVER_READS).
 *
 * Enable audits: PAYMENT_CANONICAL_SHADOW=1
 *
 * Avoids importing paymentStateProjection / paymentResponsePresenter (circular deps when projection
 * dynamically loads shadow).
 */

import { fetchPaymentByIdSkeleton } from './paymentIntentRepository.js';
import { fetchAttemptsByGatewayTransactionIdOrderedById } from './paymentAttemptRepository.js';
import { fetchTransitionsForPaymentSkeleton } from './paymentTransitionRepository.js';
import { ingestCanonicalShadowAudit } from './paymentCanonicalMetrics.js';
import { isCanonicalFirstProjectionReadsEnabled } from './paymentIntentCutover.js';

/** Keep aligned with AMOUNT_TOLERANCE_MINOR in paymentStateProjection.js */
const AMOUNT_TOLERANCE_MINOR = 1;

/** Mirror UX_TERMINAL_STATUSES from paymentResponsePresenter.js (names only). */
const UX_TERMINAL_STATUSES_SHADOW = new Set(['completed', 'failed', 'expired', 'reversed', 'manual_review']);

/** @typedef {'match'|'status_mismatch'|'amount_mismatch'|'missing_canonical'|'missing_gateway'|'transition_gap'|'orphan_attempt'|'duplicate_attempt_anchor'} CanonicalShadowClassification */

export const CANONICAL_SHADOW_CLASSIFICATION = Object.freeze({
  match: 'match',
  status_mismatch: 'status_mismatch',
  amount_mismatch: 'amount_mismatch',
  missing_canonical: 'missing_canonical',
  missing_gateway: 'missing_gateway',
  transition_gap: 'transition_gap',
  orphan_attempt: 'orphan_attempt',
  duplicate_attempt_anchor: 'duplicate_attempt_anchor',
});

export function isCanonicalShadowEnabled() {
  return String(process.env.PAYMENT_CANONICAL_SHADOW || '').trim() === '1';
}

/** Task 19D — canonical-first gateway evidence merge (controlled migration). Disabled by default. */
export function isCanonicalReadsEnabled() {
  return String(process.env.PAYMENT_CANONICAL_READS || '').trim() === '1';
}

/** @type {{ lane: null|'canonical'|'gateway', detail: unknown }} */
let _controlledReadTel = { lane: null, detail: null };

export function clearControlledReadTelemetry() {
  _controlledReadTel = { lane: null, detail: null };
}

export function getControlledReadTelemetry() {
  return { lane: _controlledReadTel.lane, detail: _controlledReadTel.detail };
}

/**
 * Records which lane served gateway evidence for projection (tests / ops).
 * @param {'canonical'|'gateway'} lane
 */
export function recordControlledReadLane(lane, detail = null) {
  if (!isCanonicalFirstProjectionReadsEnabled()) {
    _controlledReadTel = { lane: null, detail: null };
    return;
  }
  _controlledReadTel = { lane, detail };
}

/** @type {{ projection: object|null, ux: object|null }} */
let _scratch = { projection: null, ux: null };

export function clearCanonicalShadowScratch() {
  _scratch = { projection: null, ux: null };
}

export function getCanonicalShadowScratch() {
  return {
    projection: _scratch.projection ? { ..._scratch.projection } : null,
    ux: _scratch.ux ? { ..._scratch.ux } : null,
  };
}

function normUpper(s) {
  return String(s == null ? '' : s)
    .trim()
    .toUpperCase();
}

function safeMinor(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v));
}

/**
 * Deterministic UX family from canonical payments.status ONLY (Task 19C: no gateway fallback).
 * @param {string|null|undefined} payStatus
 */
export function deriveCanonicalUxFamilyFromPaymentStatusOnly(payStatus) {
  const u = normUpper(payStatus);
  if (['FAILED', 'VOIDED'].includes(u)) return 'failed';
  if (u === 'REFUNDED') return 'reversed';
  if (['CAPTURED', 'SETTLED', 'COMPLETED', 'PAID'].includes(u)) return 'completed';
  if (u === 'EXPIRED') return 'expired';
  if (u === 'CANCELLED') return 'cancelled';
  return 'non_terminal';
}

/**
 * Task 19D precondition: bundle complete for canonical-first projection branch.
 *
 * @param {{ attempts: unknown[], payment: unknown|null, transitions: unknown[] }} bundle
 * @param {string} gatewayTxId
 */
export function validateCanonicalBundleCompletenessForRead(bundle, gatewayTxId) {
  const gwId = String(gatewayTxId || '').trim();
  if (!gwId) return { ok: false, reason: 'missing_gateway_transaction_id' };
  if (!bundle?.payment) return { ok: false, reason: 'missing_payment' };
  if (!bundle.attempts?.length) return { ok: false, reason: 'missing_attempt_anchor' };
  if (bundle.attempts.length !== 1) return { ok: false, reason: 'duplicate_attempt_anchor' };
  if (!bundle.transitions?.length) return { ok: false, reason: 'transition_gap' };

  const a = bundle.attempts[0];
  if (String(a.gateway_transaction_id || '') !== gwId) {
    return {
      ok: false,
      reason: 'gateway_anchor_mismatch',
      attempt_gw: String(a.gateway_transaction_id),
      expected: gwId,
    };
  }
  const aid = bundle.payment.active_attempt_id;
  if (!aid || String(aid) !== String(a.id)) {
    return { ok: false, reason: 'active_attempt_incomplete' };
  }

  return { ok: true };
}

/**
 * Build gateway evidence overlay from canonical mirror; settlement + id unchanged from fallback.
 *
 * @param {{ payment: any }} bundle
 * @param {{ id?: string, status?: string, amount_minor?: number|null, settlement_status?: string|null }|null} fallbackGatewayRow
 */
export function mergeGatewayEvidenceForControlledRead(bundle, fallbackGatewayRow) {
  if (!fallbackGatewayRow || !bundle?.payment) return fallbackGatewayRow;
  const minorSrc = bundle.payment.amount_minor;
  const minor =
    minorSrc != null && Number.isFinite(Number(minorSrc)) ? Math.round(Number(minorSrc)) : fallbackGatewayRow.amount_minor;
  return {
    ...fallbackGatewayRow,
    status: String(bundle.payment.status ?? ''),
    amount_minor: minor != null ? Math.round(Number(minor)) : fallbackGatewayRow.amount_minor,
  };
}

/**
 * Pure classifier for tests / deterministic audit object.
 *
 * @param {{
 *   bundle: { attempts: any[], payment: any|null, transitions: any[] },
 *   gatewayRow: { id?: string, status?: string, amount_minor?: number }|null,
 *   uxPayload?: { status?: string }|null,
 * }} inp
 */
export function classifyCanonicalShadowPure(inp) {
  const gw = inp.gatewayRow;
  const { attempts, payment, transitions } = inp.bundle || { attempts: [], payment: null, transitions: [] };
  const ux = inp.uxPayload;

  const hasGw = !!(gw && (gw.id != null || gw.status != null || gw.amount_minor != null));
  const gwStatus = normUpper(gw?.status);
  const gwMinor = safeMinor(gw?.amount_minor);

  if (attempts.length > 1) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.duplicate_attempt_anchor,
      detail: {
        reason: 'multiple_attempt_rows_same_gateway',
        attempt_ids_ordered: [...attempts].map((a) => String(a.id)).sort(),
      },
    };
  }

  if (hasGw && attempts.length === 0) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.missing_canonical,
      detail: { reason: 'gateway_present_no_canonical_anchor' },
    };
  }

  if (!hasGw && payment) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.missing_gateway,
      detail: { reason: 'canonical_present_gateway_evidence_missing' },
    };
  }

  if (!payment) {
    if (!hasGw) {
      return { classification: CANONICAL_SHADOW_CLASSIFICATION.match, detail: { reason: 'no_gateway_no_canonical' } };
    }
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.match,
      detail: { reason: 'gateway_only_precanonical_legacy' },
    };
  }

  if (!transitions?.length) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.transition_gap,
      detail: { reason: 'payment_without_transition_history' },
    };
  }

  const payMinor = safeMinor(payment.amount_minor);

  /** active_attempt orphan check */
  if (payment.active_attempt_id) {
    const active = attempts.find((a) => String(a.id) === String(payment.active_attempt_id));
    const gwId = gw?.id != null ? String(gw.id) : '';
    if (!active || String(active.gateway_transaction_id || '') !== gwId) {
      return {
        classification: CANONICAL_SHADOW_CLASSIFICATION.orphan_attempt,
        detail: {
          reason: 'active_attempt_mismatch_gateway',
          active_attempt_id: String(payment.active_attempt_id),
        },
      };
    }
  }

  const payStatus = normUpper(payment.status);
  if (hasGw && gwStatus && payStatus && gwStatus !== payStatus) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.status_mismatch,
      detail: { gateway_status: gwStatus, canonical_payment_status: payStatus },
    };
  }

  if (hasGw && gwMinor != null && payMinor != null && Math.abs(gwMinor - payMinor) > AMOUNT_TOLERANCE_MINOR) {
    return {
      classification: CANONICAL_SHADOW_CLASSIFICATION.amount_mismatch,
      detail: { gateway_amount_minor: gwMinor, canonical_amount_minor: payMinor },
    };
  }

  if (ux && ux.status) {
    const fam = deriveCanonicalUxFamilyFromPaymentStatusOnly(payment.status);
    const st = String(ux.status);
    const terminalUx = UX_TERMINAL_STATUSES_SHADOW.has(st);
    const mapOk = () => {
      if (fam === 'completed' && st === 'completed') return true;
      if (fam === 'failed' && st === 'failed') return true;
      if (fam === 'reversed' && st === 'reversed') return true;
      if (fam === 'expired' && st === 'expired') return true;
      if (fam === 'cancelled' && (st === 'failed' || st === 'expired')) return true;
      if (fam === 'non_terminal' && !terminalUx && st !== 'manual_review') return true;
      if (st === 'manual_review') return true;
      return false;
    };
    if (!mapOk()) {
      return {
        classification: CANONICAL_SHADOW_CLASSIFICATION.status_mismatch,
        detail: { ux_status: st, canonical_ux_family: fam, canonical_payment_status: payStatus },
      };
    }
  }

  return {
    classification: CANONICAL_SHADOW_CLASSIFICATION.match,
    detail: {
      gateway_status: gwStatus || null,
      canonical_payment_status: payStatus || null,
    },
  };
}

/**
 * Load canonical bundle using id ordering only (no created_at).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {string} gatewayTransactionUuid
 */
export async function loadCanonicalBundleByGatewayTxId(client, gatewayTransactionUuid) {
  const attempts = await fetchAttemptsByGatewayTransactionIdOrderedById(client, gatewayTransactionUuid);
  if (!attempts.length) {
    return { attempts: [], payment: null, transitions: [] };
  }
  const paymentId = String(attempts[0].payment_id);
  const payment = await fetchPaymentByIdSkeleton(client, paymentId);
  const transitions = await fetchTransitionsForPaymentSkeleton(client, paymentId);
  return { attempts, payment, transitions };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   gatewayTransactionId: string,
 *   gatewayRow: object|null,
 *   projected: object,
 *   uxPayload?: object|null,
 *   prefetchedCanonicalBundle?: object|null,
 * }} ctx
 */
export async function runFullCanonicalShadowAudit(client, ctx) {
  const bundle =
    Object.prototype.hasOwnProperty.call(ctx, 'prefetchedCanonicalBundle') &&
    ctx.prefetchedCanonicalBundle !== undefined
      ? ctx.prefetchedCanonicalBundle
      : await loadCanonicalBundleByGatewayTxId(client, String(ctx.gatewayTransactionId || ''));
  return classifyCanonicalShadowPure({
    bundle,
    gatewayRow: ctx.gatewayRow,
    uxPayload: ctx.uxPayload || null,
  });
}

/**
 * Projection leg: attaches last audit snapshot to scratch (telemetry / tests).
 */
export async function auditCanonicalShadowForProjectionRead(client, payload) {
  const ctx = {
    gatewayTransactionId: payload.gatewayTransactionId,
    gatewayRow: payload.gatewayRow,
    projected: payload.projected,
    uxPayload: null,
  };
  if ('prefetchedCanonicalBundle' in payload && payload.prefetchedCanonicalBundle !== undefined) {
    ctx.prefetchedCanonicalBundle = payload.prefetchedCanonicalBundle;
  }
  const out = await runFullCanonicalShadowAudit(client, ctx);
  _scratch.projection = {
    gateway_transaction_id: String(payload.gatewayTransactionId || ''),
    classification: out.classification,
    detail: out.detail,
    evidence: {
      projection_state: payload.projected?.projection_state ?? null,
      projection_gateway_status: normUpper(payload.projected?.gateway_status),
    },
  };
  try {
    const tel = getControlledReadTelemetry();
    ingestCanonicalShadowAudit({
      source: 'shadow_projection',
      gateway_transaction_id: String(payload.gatewayTransactionId || ''),
      payment_id: String(payload.projected?.payment_id || ''),
      classification: out.classification,
      reason_codes: payload.projected?.reason_codes ?? [],
      fallback_used: isCanonicalFirstProjectionReadsEnabled() && tel.lane === 'gateway',
      trace_id: payload.trace_id != null ? String(payload.trace_id) : null,
      created_at_ms: Date.now(),
    });
  } catch {
    /* Task 19E: metrics never affect payment flow */
  }
  return out;
}

/** Presenter leg — same read bundle; uxPayload participates in pure classify. */
export async function auditCanonicalShadowForUxRead(client, payload) {
  const out = await runFullCanonicalShadowAudit(client, {
    gatewayTransactionId: payload.gatewayTransactionId,
    gatewayRow: payload.gatewayRow,
    projected: payload.projected,
    uxPayload: payload.uxPayload,
  });
  _scratch.ux = {
    gateway_transaction_id: String(payload.gatewayTransactionId || ''),
    classification: out.classification,
    detail: out.detail,
    evidence: {
      ux_status: payload.uxPayload?.status ?? null,
    },
  };
  try {
    const tel = getControlledReadTelemetry();
    ingestCanonicalShadowAudit({
      source: 'shadow_ux',
      gateway_transaction_id: String(payload.gatewayTransactionId || ''),
      payment_id: String(payload.projected?.payment_id || ''),
      classification: out.classification,
      reason_codes: payload.projected?.reason_codes ?? [],
      fallback_used: isCanonicalFirstProjectionReadsEnabled() && tel.lane === 'gateway',
      trace_id: payload.trace_id != null ? String(payload.trace_id) : null,
      created_at_ms: Date.now(),
    });
  } catch {
    /* Task 19E: metrics never affect payment flow */
  }
  return out;
}
