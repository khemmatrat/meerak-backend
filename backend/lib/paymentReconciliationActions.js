/**
 * Task 13: Payment Core reconciliation — action lines & pure classification.
 * READ-ONLY semantics: no mutations, no enqueue, no hidden retries.
 *
 * Amounts are compared in minor units (integers) only; no float money math.
 */

/** @typedef {'matched'|'missing_webhook'|'status_mismatch'|'amount_mismatch'|'provider_unavailable'|'missing_internal_payment'} ReconciliationStatus */

/** @typedef {'none'|'manual_replay_webhook'|'manual_review'|'freeze_and_manual_review'|'retry_reconciliation_later'|'manual_review_high_priority'} ReconciliationNextAction */

export const AMOUNT_TOLERANCE_MINOR = 1;

/** Frozen classification labels (additive; do not rename). */
export const RECONCILIATION_STATUS = Object.freeze({
  MATCHED: 'matched',
  MISSING_WEBHOOK: 'missing_webhook',
  STATUS_MISMATCH: 'status_mismatch',
  AMOUNT_MISMATCH: 'amount_mismatch',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  MISSING_INTERNAL_PAYMENT: 'missing_internal_payment',
});

export const RECONCILIATION_NEXT_ACTION = Object.freeze({
  NONE: 'none',
  MANUAL_REPLAY_WEBHOOK: 'manual_replay_webhook',
  MANUAL_REVIEW: 'manual_review',
  FREEZE_AND_MANUAL_REVIEW: 'freeze_and_manual_review',
  RETRY_RECONCILIATION_LATER: 'retry_reconciliation_later',
  MANUAL_REVIEW_HIGH_PRIORITY: 'manual_review_high_priority',
});

/**
 * Normalize optional minor amount to integer or null (non-finite → null).
 * @param {unknown} v
 * @returns {number|null}
 */
export function toMinorInt(v) {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Max spread among provided minor amounts when all comparable; ignores nulls.
 * @param {readonly (number|null)[]} amounts
 * @returns {{ comparable: boolean, spread: number, values: number[] }}
 */
export function maxSpreadMinor(amounts) {
  const vals = amounts.filter((x) => x != null && Number.isFinite(Number(x))).map((x) => Math.round(Number(x)));
  if (vals.length < 2) return { comparable: false, spread: 0, values: vals };
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return { comparable: true, spread: hi - lo, values: vals };
}

/**
 * Deterministic merge of duplicate provider-side events (same payment key).
 * Sort by stable provider_event_id then payment_id; does not mutate input rows.
 *
 * @param {readonly { provider_event_id: string, payment_id?: string|null }[]} rows
 */
export function mergeDuplicateProviderEvents(rows) {
  const list = [...(rows || [])].sort((a, b) => {
    const ae = String(a?.provider_event_id || '');
    const be = String(b?.provider_event_id || '');
    if (ae !== be) return ae < be ? -1 : ae > be ? 1 : 0;
    const ap = String(a?.payment_id || '');
    const bp = String(b?.payment_id || '');
    return ap.localeCompare(bp);
  });
  if (!list.length) return { merged_events: [], primary_provider_event_id: null };
  /** @type {{ provider_event_id: string, payment_id?: string|null }[]} */
  const dedup = [];
  const seen = new Set();
  for (const r of list) {
    const k = `${String(r?.provider_event_id || '')}\t${String(r?.payment_id || '')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
  }
  return {
    merged_events: dedup,
    primary_provider_event_id: dedup[0]?.provider_event_id ?? null,
  };
}

/**
 * @param {{
 *   provider_available: boolean,
 *   provider_data_complete: boolean,
 *   provider_paid_or_captured: boolean,
 *   provider_status: string|null,
 *   provider_amount_minor: number|null,
 *   duplicate_provider_events: boolean,
 *   gateway_row_present: boolean,
 *   gateway_status: string|null,
 *   gateway_amount_minor: number|null,
 *   internal_finalized: boolean,
 *   webhook_processing_evidence: boolean,
 *   ledger_event_types_ordered_by_id_desc: string[],
 *   ledger_amount_minor: number|null,
 *   expects_escrow_hold: boolean,
 *   provider_reversed: boolean,
 * }} ev
 */
export function classifyPaymentCoreReconciliation(ev) {
  const gwSt = String(ev.gateway_status || '').toUpperCase();
  const provSt = String(ev.provider_status || '').toLowerCase();

  const ledgerTypes = [...(ev.ledger_event_types_ordered_by_id_desc || [])];
  const ledgerHasPaymentCompleted = ledgerTypes.includes('PAYMENT_COMPLETED');
  const ledgerHasEscrowHold = ledgerTypes.includes('ESCROW_HOLD');

  let duplicateNote = '';
  if (ev.duplicate_provider_events) duplicateNote = ';duplicate_provider_events_converged';

  const evidence = {
    provider_status: provSt || null,
    internal_status: gwSt || null,
    ledger_event_types: ledgerTypes,
    provider_amount: ev.provider_amount_minor,
    internal_amount: ev.gateway_amount_minor,
    ledger_amount: ev.ledger_amount_minor,
  };

  /** @param {typeof evidence} evi */
  function finish(st, na, rmr, rr, evi) {
    const reason = rr + duplicateNote;
    return {
      status: st,
      next_action: na,
      requires_manual_review: rmr,
      reconciliation_reason: reason,
      evidence: { ...evi },
    };
  }

  if (ev.provider_available !== true || ev.provider_data_complete === false) {
    return finish(RECONCILIATION_STATUS.PROVIDER_UNAVAILABLE, RECONCILIATION_NEXT_ACTION.RETRY_RECONCILIATION_LATER, false, 'provider_data_incomplete_or_unavailable', evidence);
  }

  if (ev.provider_paid_or_captured && ev.gateway_row_present !== true) {
    return finish(
      RECONCILIATION_STATUS.MISSING_INTERNAL_PAYMENT,
      RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW_HIGH_PRIORITY,
      true,
      'provider_reports_paid_no_internal_gateway_row',
      evidence,
    );
  }

  const amountsForSpread = [ev.provider_amount_minor, ev.gateway_amount_minor, ev.ledger_amount_minor];
  const spread = maxSpreadMinor(amountsForSpread);
  const hasInternalMinor =
    ev.gateway_amount_minor != null || ev.ledger_amount_minor != null;
  if (
    spread.comparable &&
    spread.values.length >= 2 &&
    ev.provider_amount_minor != null &&
    hasInternalMinor &&
    spread.spread > AMOUNT_TOLERANCE_MINOR
  ) {
    return finish(
      RECONCILIATION_STATUS.AMOUNT_MISMATCH,
      RECONCILIATION_NEXT_ACTION.FREEZE_AND_MANUAL_REVIEW,
      true,
      `amount_spread_minor_${spread.spread}_exceeds_tolerance_${AMOUNT_TOLERANCE_MINOR}`,
      evidence,
    );
  }

  if (ledgerHasPaymentCompleted && (gwSt === 'PENDING' || gwSt === 'AUTHORIZED')) {
    return finish(
      RECONCILIATION_STATUS.STATUS_MISMATCH,
      RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW,
      true,
      'ledger_payment_completed_gateway_not_terminal',
      evidence,
    );
  }

  if (gwSt === 'CAPTURED' || gwSt === 'SETTLED') {
    if (ev.expects_escrow_hold === true && !ledgerHasEscrowHold) {
      return finish(
        RECONCILIATION_STATUS.STATUS_MISMATCH,
        RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW,
        true,
        'gateway_captured_expected_escrow_hold_missing',
        evidence,
      );
    }
  }

  if (ev.provider_reversed === true && ev.internal_finalized === true) {
    return finish(
      RECONCILIATION_STATUS.STATUS_MISMATCH,
      RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW,
      true,
      'provider_reversed_internal_still_finalized',
      evidence,
    );
  }

  if (
    ev.provider_paid_or_captured &&
    ev.gateway_row_present === true &&
    (ev.internal_finalized !== true || ev.webhook_processing_evidence !== true)
  ) {
    return finish(
      RECONCILIATION_STATUS.MISSING_WEBHOOK,
      RECONCILIATION_NEXT_ACTION.MANUAL_REPLAY_WEBHOOK,
      true,
      'paid_or_captured_but_missing_finalization_or_webhook_marker',
      evidence,
    );
  }

  if (
    ev.provider_paid_or_captured &&
    ev.gateway_row_present === true &&
    ev.internal_finalized === true &&
    ev.webhook_processing_evidence === true
  ) {
    if (
      spread.comparable &&
      ev.provider_amount_minor != null &&
      ev.gateway_amount_minor != null &&
      spread.spread <= AMOUNT_TOLERANCE_MINOR
    ) {
      return finish(
        RECONCILIATION_STATUS.MATCHED,
        RECONCILIATION_NEXT_ACTION.NONE,
        false,
        'provider_gateway_ledger_aligned',
        evidence,
      );
    }
    return finish(
      RECONCILIATION_STATUS.MATCHED,
      RECONCILIATION_NEXT_ACTION.NONE,
      false,
      'matched_insufficient_amount_triangulation',
      evidence,
    );
  }

  return finish(
    RECONCILIATION_STATUS.MATCHED,
    RECONCILIATION_NEXT_ACTION.NONE,
    false,
    'no_provider_paid_signal_or_idle',
    evidence,
  );
}
