/**
 * Task 14: Payment state projection — deterministic read-model from evidence.
 * Pure projection: no ledger mutation; never auto-corrects source rows.
 *
 * Invariants (frozen):
 * - Impossible ledger id order (PAYMENT_COMPLETED / ESCROW_HOLD / ESCROW_RELEASED) ⇒
 *   PAYMENT_REQUIRES_MANUAL_REVIEW — evidence is NEVER silently rewritten.
 * - Sequencing uses ledger_entries.id only (see paymentStateQueries.js); never created_at.
 */

import { loadPaymentProjectionEvidence } from './paymentStateQueries.js';
import {
  auditCanonicalShadowForProjectionRead,
  CANONICAL_SHADOW_CLASSIFICATION,
  classifyCanonicalShadowPure,
  clearControlledReadTelemetry,
  isCanonicalShadowEnabled,
  loadCanonicalBundleByGatewayTxId,
  mergeGatewayEvidenceForControlledRead,
  recordControlledReadLane,
  validateCanonicalBundleCompletenessForRead,
} from './paymentCanonicalShadow.js';
import { ingestControlledReadDecision } from './paymentCanonicalMetrics.js';
import {
  getControlledReadProgram,
  getIntentCutoverPhaseLabel,
  isCanonicalFirstProjectionReadsEnabled,
} from './paymentIntentCutover.js';

export const AMOUNT_TOLERANCE_MINOR = 1;

/** @typedef {'PAYMENT_PENDING'|'PAYMENT_CONFIRMED'|'ESCROW_HELD'|'ESCROW_RELEASED'|'PAYMENT_REVERSED'|'PAYMENT_FAILED'|'PAYMENT_REQUIRES_MANUAL_REVIEW'} PaymentProjectionState */

export const PROJECTION_STATES = Object.freeze({
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  ESCROW_HELD: 'ESCROW_HELD',
  ESCROW_RELEASED: 'ESCROW_RELEASED',
  PAYMENT_REVERSED: 'PAYMENT_REVERSED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REQUIRES_MANUAL_REVIEW: 'PAYMENT_REQUIRES_MANUAL_REVIEW',
});

/** @typedef {{ id: string|number, event_type: string, amount_minor?: number|null }} LedgerEvidenceRowNorm */
/** @typedef {{ status: string, amount_minor: number|null, settlement_status?: string|null }} GatewayNorm */
/** @typedef {{ id?: string|number, state: string }} EscrowEvidenceRowNorm */

/**
 * Normalize ledger rows by ascending id for deterministic sequencing.
 * @param {readonly LedgerEvidenceRowNorm[]} rows
 */
export function normalizeLedgerRowsByIdAsc(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = Number(a.id);
    const db = Number(b.id);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * @param {readonly LedgerEvidenceRowNorm[]} ledgerAsc
 */
function ledgerIdsOfType(ledgerAsc, types) {
  const set = new Set(types.map((x) => String(x)));
  return ledgerAsc.filter((x) => set.has(String(x.event_type))).map((x) => ({ id: x.id, et: String(x.event_type), minor: x.amount_minor }));
}

/**
 * @param {readonly string[]} codes
 */
function sortedUniqueReasons(codes) {
  const u = [...new Set((codes || []).filter(Boolean).map(String))];
  u.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return u;
}

/** Dedupe + sort webhook keys — replay-safe (same multiset ⇒ same canonical keys). */
function canonicalProcessedWebhookKeys(rows) {
  const list = [...(rows || [])].filter((x) => x?.provider != null || x?.event_id != null);
  list.sort((a, b) => {
    const ka = `${String(a.provider || '')}:${String(a.event_id || '')}`;
    const kb = `${String(b.provider || '')}:${String(b.event_id || '')}`;
    return ka.localeCompare(kb);
  });
  /** @type {typeof list} */
  const out = [];
  const seen = new Set();
  for (const w of list) {
    const prov = String(w.provider || '').toLowerCase().trim();
    const eid = String(w.event_id || '').trim();
    if (!prov || !eid) continue;
    const key = `${prov}\t${eid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider: prov, event_id: eid });
  }
  return out;
}

/**
 * Deterministic projection from normalized evidence snapshot (sorts ledger + escrow by id).
 * @param {{
 *   payment_id: string,
 *   ledger_rows: readonly LedgerEvidenceRowNorm[],
 *   gateway_row: GatewayNorm | null,
 *   escrow_events: readonly (EscrowEvidenceRowNorm & { id?: string|number })[],
 *   processed_webhook_keys?: readonly { provider?: string|null, event_id?: string|null }[],
 *   provider_paid_evidence?: boolean,
 *   provider_available?: boolean,
 *   provider_amount_minor?: number|null,
 *   duplicate_provider_events?: boolean,
 * }} ev
 */
export function projectPaymentState(ev) {
  const payment_id = String(ev.payment_id || '').trim();
  const ledgerAsc = normalizeLedgerRowsByIdAsc(ev.ledger_rows || []);
  const escrowAsc = [...(ev.escrow_events || [])].sort((a, b) => {
    const da = Number(a.id);
    const db = Number(b.id);
    if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });

  /** @type {string[]} */
  let reason_codes = [];

  const gw = ev.gateway_row
    ? {
        status: String(ev.gateway_row.status || '').toUpperCase(),
        amount_minor:
          ev.gateway_row.amount_minor != null && Number.isFinite(Number(ev.gateway_row.amount_minor))
            ? Math.round(Number(ev.gateway_row.amount_minor))
            : null,
        settlement_status: ev.gateway_row.settlement_status
          ? String(ev.gateway_row.settlement_status || '').toUpperCase()
          : null,
      }
    : null;

  const pcRows = ledgerIdsOfType(ledgerAsc, ['PAYMENT_COMPLETED']);
  const ehRows = ledgerIdsOfType(ledgerAsc, ['ESCROW_HOLD']);
  const erRows = ledgerIdsOfType(ledgerAsc, ['ESCROW_RELEASED']);

  const idNum = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : NaN;
  };

  /** ---------------------------------------------------------------------- */
  /* Manual-review / invariant gates (deterministic ordering of checks)       */
  /** ---------------------------------------------------------------------- */

  if ((ev.duplicate_provider_events ?? false) === true) reason_codes.push('duplicate_provider_events');

  if (ev.provider_available === false) reason_codes.push('provider_unavailable');

  if (pcRows.length > 1) reason_codes.push('multiple_ledger_PAYMENT_COMPLETED');

  if (ehRows.length > 1) reason_codes.push('multiple_ledger_ESCROW_HOLD');

  if (erRows.length > 1) reason_codes.push('multiple_ledger_ESCROW_RELEASED');

  /** Escrow ordering: PAYMENT_COMPLETED.id < ESCROW_HOLD.id < ESCROW_RELEASED.id */
  let pcEscrowFirst = pcRows.length ? pcRows.reduce((min, x) => (idNum(min.id) < idNum(x.id) ? min : x)) : null;
  let holdFirst = ehRows.length ? ehRows.reduce((min, x) => (idNum(min.id) < idNum(x.id) ? min : x)) : null;
  let relFirst = erRows.length ? erRows.reduce((min, x) => (idNum(min.id) < idNum(x.id) ? min : x)) : null;

  if (holdFirst && pcEscrowFirst) {
    if (!(idNum(pcEscrowFirst.id) < idNum(holdFirst.id))) reason_codes.push('ledger_ESCROW_HOLD_before_PAYMENT_COMPLETED');
  }
  if (relFirst && holdFirst) {
    if (!(idNum(holdFirst.id) < idNum(relFirst.id))) reason_codes.push('ledger_ESCROW_RELEASED_before_ESCROW_HOLD');
  }
  if (relFirst && !ehRows.length) reason_codes.push('ledger_ESCROW_RELEASED_without_ESCROW_HOLD');
  if (holdFirst && !pcEscrowFirst) reason_codes.push('ledger_ESCROW_HOLD_without_PAYMENT_COMPLETED');

  /** payment_escrow_events ordering: RELEASED implies HOLD existed with smaller id when both present */
  const escHoldEvt = escrowAsc.find((r) => String(r.state || '') === 'HOLD');
  const escRelEvt = escrowAsc.filter((r) => String(r.state || '') === 'RELEASED');

  if (escRelEvt.length > 1) reason_codes.push('multiple_escrow_tables_RELEASED');
  const escReleased = escRelEvt[0];

  if (escReleased && escHoldEvt) {
    if (!(idNum(escHoldEvt.id) < idNum(escReleased.id))) reason_codes.push('escrow_events_RELEASED_before_HOLD');

    /** Replay / duplicate escrow rows flagged */
  }

  if (escHoldEvt && !pcEscrowFirst) reason_codes.push('escrow_table_HOLD_without_ledger_PAYMENT_COMPLETED');

  /** Provider-paid without internal anchors */
  if (ev.provider_paid_evidence === true && ev.provider_available !== false) {
    if (!gw && !pcEscrowFirst) reason_codes.push('provider_paid_missing_internal_payment');
  }

  /** Amount mismatch PAYMENT_COMPLETED vs gateway */
  if (gw && gw.amount_minor != null && pcEscrowFirst?.minor != null) {
    if (Math.abs(gw.amount_minor - pcEscrowFirst.minor) > AMOUNT_TOLERANCE_MINOR)
      reason_codes.push('amount_mismatch_gateway_vs_ledger');
  }

  /** Conflicting gateway vs ledger */
  if (gw) {
    if (gw.status === 'FAILED' && pcEscrowFirst)
      reason_codes.push('gateway_failure_with_PAYMENT_COMPLETED_ledger');

    /** Stale gateway: escrow released on ledger but gateway not settled */
    if (
      gw.settlement_status &&
      gw.settlement_status !== 'ESCROW_RELEASED' &&
      relFirst &&
      ['CAPTURED', 'SETTLED'].includes(gw.status)
    ) {
      reason_codes.push('gateway_settlement_stale_vs_ledger_ESCROW_RELEASED');
    }
    if (gw.status === 'FAILED' && gw.settlement_status === 'ESCROW_RELEASED' && relFirst) {
      reason_codes.push('conflicting_gateway_status_vs_settlement');
    }
    if (gw.status === 'PENDING' && relFirst && pcEscrowFirst) reason_codes.push('gateway_pending_with_ESCROW_RELEASED_ledger');

    /** Reversed after release — recorded for replay / audit (not forcing manual review unless other signals) */
    if (gw.status === 'REFUNDED' && relFirst) reason_codes.push('reversed_after_escrow_release_signal');
  }

  const pwh = canonicalProcessedWebhookKeys(ev.processed_webhook_keys || []);

  /** ---------------------------------------------------------------------- */
  /* Decide projection state                                                   */
  /** ---------------------------------------------------------------------- */

  reason_codes = sortedUniqueReasons(reason_codes);

  const manual_signals = [
    'multiple_ledger_PAYMENT_COMPLETED',
    'multiple_ledger_ESCROW_HOLD',
    'multiple_ledger_ESCROW_RELEASED',
    'ledger_ESCROW_HOLD_before_PAYMENT_COMPLETED',
    'ledger_ESCROW_RELEASED_before_ESCROW_HOLD',
    'ledger_ESCROW_RELEASED_without_ESCROW_HOLD',
    'ledger_ESCROW_HOLD_without_PAYMENT_COMPLETED',
    'multiple_escrow_tables_RELEASED',
    'escrow_events_RELEASED_before_HOLD',
    'escrow_table_HOLD_without_ledger_PAYMENT_COMPLETED',
    'provider_paid_missing_internal_payment',
    'amount_mismatch_gateway_vs_ledger',
    'gateway_failure_with_PAYMENT_COMPLETED_ledger',
    'conflicting_gateway_status_vs_settlement',
    'gateway_pending_with_ESCROW_RELEASED_ledger',
    'gateway_settlement_stale_vs_ledger_ESCROW_RELEASED',
  ];

  /** Impossible/conflict subsets */
  const critical = reason_codes.filter((c) =>
    manual_signals.includes(c),
  );

  if (critical.length) {
    return {
      payment_id,
      projection_state: PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
      manual_review_required: true,
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw?.status ?? null,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };
  }

  /** PAYMENT_FAILED */
  if (gw && gw.status === 'FAILED' && !pcEscrowFirst)
    return {
      payment_id,
      projection_state: PROJECTION_STATES.PAYMENT_FAILED,
      manual_review_required: !!reason_codes.filter((r) => r !== 'duplicate_provider_events' && r !== 'provider_unavailable')
        .length,
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw.status,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };

  /** PAYMENT_REVERSED */
  if (gw?.status === 'REFUNDED')
    return {
      payment_id,
      projection_state: PROJECTION_STATES.PAYMENT_REVERSED,
      manual_review_required:
        !!reason_codes.length &&
        !!(reason_codes.filter((x) => x !== 'duplicate_provider_events' && x !== 'provider_unavailable').length),
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw.status,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };

  if (relFirst)
    return {
      payment_id,
      projection_state: PROJECTION_STATES.ESCROW_RELEASED,
      manual_review_required: reason_codes.some((r) => r === 'duplicate_provider_events' || r === 'provider_unavailable'),
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw?.status ?? null,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };

  if (holdFirst || (escHoldEvt && pcEscrowFirst))
    return {
      payment_id,
      projection_state: PROJECTION_STATES.ESCROW_HELD,
      manual_review_required: reason_codes.some((r) => r === 'duplicate_provider_events' || r === 'provider_unavailable'),
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw?.status ?? null,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };

  if (pcEscrowFirst || gw?.status === 'CAPTURED' || gw?.status === 'SETTLED')
    return {
      payment_id,
      projection_state: PROJECTION_STATES.PAYMENT_CONFIRMED,
      manual_review_required: reason_codes.some((r) => r === 'duplicate_provider_events' || r === 'provider_unavailable'),
      reason_codes,
      ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
      escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
      gateway_status: gw?.status ?? null,
      gateway_settlement_status: gw?.settlement_status ?? null,
      processed_webhook_key_count: pwh.length,
    };

  return {
    payment_id,
    projection_state: PROJECTION_STATES.PAYMENT_PENDING,
    manual_review_required: reason_codes.some((r) => r === 'duplicate_provider_events' || r === 'provider_unavailable'),
    reason_codes,
    ledger_ordered_event_types_by_id_asc: ledgerAsc.map((x) => String(x.event_type)),
    escrow_event_states_by_id_asc: escrowAsc.map((x) => String(x.state)),
    gateway_status: gw?.status ?? null,
    gateway_settlement_status: gw?.settlement_status ?? null,
    processed_webhook_key_count: pwh.length,
  };
}

/**
 * DB-backed projection (queries are read-only inside loadPaymentProjectionEvidence).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {Parameters<typeof loadPaymentProjectionEvidence>[1]} opts
 */
export async function projectPaymentStateFromDb(client, opts) {
  clearControlledReadTelemetry();
  const ev = await loadPaymentProjectionEvidence(client, opts);
  /** Always production fallback row — shadow + drift audits compare canonical against this anchor. */
  const gateway_anchor_row = ev.gateway_row;

  /** Effective gateway-shaped evidence feeding projectPaymentState (canonical overlay only when gated + valid). */
  let gateway_row = gateway_anchor_row;

  /** Reuse canonical bundle across controlled-read decision + PAYMENT_CANONICAL_SHADOW prefetch. */
  let prefetchedCanonicalBundle;

  const gwTx =
    opts?.gateway_transaction_id && String(opts.gateway_transaction_id).trim() !== ''
      ? String(opts.gateway_transaction_id).trim()
      : '';

  const readProgram = getControlledReadProgram();
  const cutoverPhaseTag = getIntentCutoverPhaseLabel();

  if (isCanonicalFirstProjectionReadsEnabled() && gwTx && gateway_anchor_row) {
    try {
      prefetchedCanonicalBundle = await loadCanonicalBundleByGatewayTxId(client, gwTx);
      const completeness = validateCanonicalBundleCompletenessForRead(prefetchedCanonicalBundle, gwTx);
      const shadowPure = classifyCanonicalShadowPure({
        bundle: prefetchedCanonicalBundle,
        gatewayRow: gateway_anchor_row,
        uxPayload: null,
      });

      const useCanon =
        completeness.ok && shadowPure.classification === CANONICAL_SHADOW_CLASSIFICATION.match;

      if (useCanon) {
        gateway_row = mergeGatewayEvidenceForControlledRead(prefetchedCanonicalBundle, gateway_anchor_row);
        recordControlledReadLane('canonical', { classification: shadowPure.classification });
        try {
          ingestControlledReadDecision({
            gateway_transaction_id: gwTx,
            payment_id: String(ev.payment_id || ''),
            lane: 'canonical',
            completeness,
            shadow_classification: shadowPure.classification,
            trace_id: opts?.trace_id != null ? String(opts.trace_id) : null,
            created_at_ms: Date.now(),
            read_program: readProgram,
            cutover_phase: cutoverPhaseTag,
          });
        } catch {
          /* Task 19E: ingest must never break projection */
        }
      } else {
        gateway_row = gateway_anchor_row;
        recordControlledReadLane('gateway', {
          completeness_reason: completeness.ok ? null : completeness.reason,
          classification: shadowPure.classification,
        });
        try {
          ingestControlledReadDecision({
            gateway_transaction_id: gwTx,
            payment_id: String(ev.payment_id || ''),
            lane: 'gateway',
            completeness,
            shadow_classification: shadowPure.classification,
            trace_id: opts?.trace_id != null ? String(opts.trace_id) : null,
            created_at_ms: Date.now(),
            read_program: readProgram,
            cutover_phase: cutoverPhaseTag,
          });
        } catch {
          /* Task 19E */
        }
      }
    } catch {
      gateway_row = gateway_anchor_row;
      prefetchedCanonicalBundle = undefined;
      recordControlledReadLane('gateway', { load_error: true });
      try {
        ingestControlledReadDecision({
          gateway_transaction_id: gwTx,
          payment_id: String(ev.payment_id || ''),
          lane: 'gateway',
          load_error: true,
          completeness: null,
          shadow_classification: null,
          trace_id: opts?.trace_id != null ? String(opts.trace_id) : null,
          created_at_ms: Date.now(),
          read_program: readProgram,
          cutover_phase: cutoverPhaseTag,
        });
      } catch {
        /* Task 19E */
      }
    }
  }

  const projected = projectPaymentState({
    payment_id: ev.payment_id,
    ledger_rows: ev.ledger_rows,
    gateway_row,
    escrow_events: ev.escrow_events.map((row) => ({ id: row.id, state: row.state })),
    processed_webhook_keys: ev.processed_webhook_keys,
    provider_paid_evidence:
      opts?.provider_paid_evidence !== undefined ? opts.provider_paid_evidence === true : ev.provider_paid_evidence,
    provider_available:
      opts?.provider_available !== undefined ? opts.provider_available !== false : ev.provider_available,
    provider_amount_minor:
      opts?.provider_amount_minor != null ? Math.round(Number(opts.provider_amount_minor)) : ev.provider_amount_minor,
    duplicate_provider_events:
      opts?.duplicate_provider_events !== undefined
        ? opts.duplicate_provider_events === true
        : ev.duplicate_provider_events,
  });

  if (isCanonicalShadowEnabled() && gwTx) {
    try {
      await auditCanonicalShadowForProjectionRead(client, {
        gatewayTransactionId: gwTx,
        gatewayRow: gateway_anchor_row,
        projected,
        ...(prefetchedCanonicalBundle !== undefined ? { prefetchedCanonicalBundle } : {}),
      });
    } catch {
      /* shadow must never break projection contract */
    }
  }

  return projected;
}
