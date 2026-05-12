/**
 * Task 16: Canonical UX payment response (pure presenter — read-model only).
 * No ledger/webhook/reconciliation/outbound mutation. No created_at ordering.
 */

import { PROJECTION_STATES } from './paymentStateProjection.js';

export const UX_PAYMENT_STATUS = Object.freeze({
  pending: 'pending',
  awaiting_payment: 'awaiting_payment',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
  expired: 'expired',
  reversed: 'reversed',
  manual_review: 'manual_review',
});

export const UX_STATUS_VERSION = Object.freeze({
  pending: 1,
  awaiting_payment: 2,
  processing: 3,
  completed: 4,
  failed: 4,
  expired: 4,
  reversed: 5,
  manual_review: 6,
});

export const UX_TERMINAL_STATUSES = Object.freeze(
  new Set(['completed', 'failed', 'expired', 'reversed', 'manual_review']),
);

export const UX_NEXT_ACTION = Object.freeze({
  open_qr: 'open_qr',
  open_redirect: 'open_redirect',
  wait: 'wait',
  retry_payment: 'retry_payment',
  contact_support: 'contact_support',
  none: 'none',
});

export const POLL_MS_NON_TERMINAL = 4000;

export function shouldDiscardStaleUx(storedVersion, incomingVersion) {
  const stored = typeof storedVersion === 'number' && Number.isFinite(storedVersion) ? storedVersion : 0;
  const inc = typeof incomingVersion === 'number' && Number.isFinite(incomingVersion) ? incomingVersion : 0;
  return inc < stored;
}

const GW_AWAIT_USER = new Set([
  'PENDING',
  'CREATED',
  'AUTHORIZED',
  'REQUIRES_PAYMENT_METHOD',
  'REQUIRES_CONFIRMATION',
  'REQUIRES_ACTION',
  'STRIPE_REQUIRES_ACTION',
  'PAYSO_PENDING',
  'AWAITING_CAPTURE',
]);

const GW_PROCESSING = new Set(['PROCESSING', 'IN_PROGRESS']);

export function classifyGatewayStatus(bucket) {
  const s = String(bucket || '').toUpperCase().trim();
  return { awaitsUser: GW_AWAIT_USER.has(s), processingLike: GW_PROCESSING.has(s) };
}

export function deriveFailureCodeFromProjection(projection) {
  const rc = [...(projection?.reason_codes || [])].map(String).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pickFirst = (...cands) => {
    for (const c of cands) if (rc.includes(c)) return c;
    return null;
  };
  return (
    pickFirst(
      'amount_mismatch_gateway_vs_ledger',
      'gateway_failure_with_PAYMENT_COMPLETED_ledger',
      'gateway_pending_with_ESCROW_RELEASED_ledger',
      'provider_unavailable',
      'provider_paid_missing_internal_payment',
    ) || 'payment_processing_issue'
  );
}

const LANGUAGE_HINT_MAP = {
  manual_review_generic: {
    failure_hint_th: 'รายการนี้อยู่ระหว่างตรวจสอบ — หากต้องการความช่วยเหลือ กรุณาติดต่อฝ่ายสนับสนุน',
    failure_hint_en: 'This payment is under review — contact support if you need help.',
  },
  provider_unavailable: {
    failure_hint_th: 'ช่องทางชำระเงินชั่วคราวไม่พร้อมใช้งาน — ลองใหม่อีกครั้งภายหลัง',
    failure_hint_en: 'The payment provider is temporarily unavailable — please try again later.',
  },
  amount_mismatch_gateway_vs_ledger: {
    failure_hint_th: 'ยอดเงินไม่ตรงกัน — กรุณาติดต่อฝ่ายสนับสนุนพร้อมหมายเลขธุรกรรม',
    failure_hint_en: 'Payment amount mismatch — contact support with your transaction reference.',
  },
  gateway_failure_with_PAYMENT_COMPLETED_ledger: {
    failure_hint_th: 'สถานะการชำระเงินไม่สอดคล้อง — กำลังตรวจสอบโดยทีมงาน',
    failure_hint_en: 'Payment status is inconsistent — our team will review this.',
  },
  payment_processing_issue: {
    failure_hint_th: 'ไม่สามารถดำเนินการชำระเงินได้ — กรุณาลองใหม่หรือติดต่อฝ่ายสนับสนุน',
    failure_hint_en: 'Payment could not be processed — retry or contact support.',
  },
  gateway_failed: {
    failure_hint_th: 'การชำระเงินไม่สำเร็จ — กรุณาลองชำระใหม่หรือเลือกช่องทางอื่น',
    failure_hint_en: 'The payment did not go through — try again or use another method.',
  },
};

export function failureHintsUx(failure_code, uxStatus, languageHints = {}) {
  const code = failure_code ? String(failure_code) : 'payment_processing_issue';
  const presets = LANGUAGE_HINT_MAP[code] || LANGUAGE_HINT_MAP.payment_processing_issue;
  const merged = {
    failure_hint_th: languageHints.failure_hint_th || presets.failure_hint_th,
    failure_hint_en: languageHints.failure_hint_en || presets.failure_hint_en,
  };
  if (uxStatus === UX_PAYMENT_STATUS.manual_review) {
    const m = LANGUAGE_HINT_MAP.manual_review_generic;
    return {
      failure_hint_th: languageHints.failure_hint_th || merged.failure_hint_th || m.failure_hint_th,
      failure_hint_en: languageHints.failure_hint_en || merged.failure_hint_en || m.failure_hint_en,
    };
  }
  return merged;
}

export function deriveNextAction(uxStatus, opts = {}) {
  const openQr = opts.openQr === true;
  const openRedirect = opts.openRedirect === true;

  if (uxStatus === UX_PAYMENT_STATUS.manual_review) return UX_NEXT_ACTION.contact_support;
  if (
    uxStatus === UX_PAYMENT_STATUS.failed &&
    (opts.failure_retryable === true || opts.failureRetryable === true)
  )
    return UX_NEXT_ACTION.retry_payment;
  if (
    uxStatus === UX_PAYMENT_STATUS.failed ||
    uxStatus === UX_PAYMENT_STATUS.completed ||
    uxStatus === UX_PAYMENT_STATUS.expired ||
    uxStatus === UX_PAYMENT_STATUS.reversed
  )
    return UX_NEXT_ACTION.none;
  if (uxStatus === UX_PAYMENT_STATUS.awaiting_payment) {
    if (openRedirect) return UX_NEXT_ACTION.open_redirect;
    if (openQr) return UX_NEXT_ACTION.open_qr;
    return UX_NEXT_ACTION.wait;
  }
  if (uxStatus === UX_PAYMENT_STATUS.pending || uxStatus === UX_PAYMENT_STATUS.processing) return UX_NEXT_ACTION.wait;
  return UX_NEXT_ACTION.none;
}

function pollMsForStatus(uxStatus) {
  return UX_TERMINAL_STATUSES.has(uxStatus) ? 0 : POLL_MS_NON_TERMINAL;
}

/**
 * @param {{
 *   payment_id: string,
 *   projection_state: string,
 *   manual_review_required?: boolean,
 *   reason_codes?: string[],
 *   gateway_status?: string|null,
 * }} projection
 * @param {{
 *   trace_id?: string|null,
 *   display_amount?: string|number|null,
 *   expires_at?: string|null,
 *   now_ms?: number,
 *   awaiting_user_hint?: boolean,
 *   expired_override?: boolean,
 *   failure_code_override?: string|null,
 *   open_qr?: boolean,
 *   open_redirect?: boolean,
 *   failure_retryable?: boolean,
 * }} opts
 */
export function presentUxPaymentFromProjection(projection, opts = {}) {
  const payment_id = String(projection?.payment_id || '').trim();
  const nowMs =
    opts.now_ms != null && Number.isFinite(Number(opts.now_ms)) ? Number(opts.now_ms) : Date.now();
  const gwStatus = projection?.gateway_status != null ? String(projection.gateway_status).toUpperCase() : '';

  const display_amount =
    opts.display_amount != null && opts.display_amount !== '' ? String(opts.display_amount) : payment_id ? payment_id : '';

  const trace_id =
    opts.trace_id != null && opts.trace_id !== '' ? String(opts.trace_id) : `payment_trace:${payment_id}`;
  let expires_at = opts.expires_at != null && String(opts.expires_at).trim() !== '' ? String(opts.expires_at) : null;

  const ps = String(projection?.projection_state || '');

  const successProj = new Set([
    PROJECTION_STATES.PAYMENT_CONFIRMED,
    PROJECTION_STATES.ESCROW_HELD,
    PROJECTION_STATES.ESCROW_RELEASED,
  ]);

  const expiredByClock =
    !!(
      expires_at &&
      Number.isFinite(Date.parse(expires_at)) &&
      Date.parse(expires_at) <= nowMs &&
      !successProj.has(ps) &&
      ps !== PROJECTION_STATES.PAYMENT_REVERSED &&
      ps !== PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW &&
      ps !== PROJECTION_STATES.PAYMENT_FAILED
    );

  let status = UX_PAYMENT_STATUS.pending;
  let failure_code = null;

  if (
    ps === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW ||
    projection.manual_review_required === true
  ) {
    status = UX_PAYMENT_STATUS.manual_review;
    failure_code = opts.failure_code_override || deriveFailureCodeFromProjection(projection);
  } else if (ps === PROJECTION_STATES.PAYMENT_FAILED) {
    status = UX_PAYMENT_STATUS.failed;
    failure_code =
      gwStatus === 'FAILED' ? 'gateway_failed' : opts.failure_code_override || deriveFailureCodeFromProjection(projection);
  } else if (ps === PROJECTION_STATES.PAYMENT_REVERSED || gwStatus === 'REFUNDED') {
    status = UX_PAYMENT_STATUS.reversed;
  } else if (successProj.has(ps)) {
    status = UX_PAYMENT_STATUS.completed;
  } else if (
    opts.expired_override === true ||
    (expiredByClock && ps === PROJECTION_STATES.PAYMENT_PENDING)
  ) {
    /** QR / invoice clock — dominates provider "pending" */
    status = UX_PAYMENT_STATUS.expired;
  } else if (ps === PROJECTION_STATES.PAYMENT_PENDING || !projection.projection_state) {
    const gw = classifyGatewayStatus(gwStatus);
    if (gw.processingLike) status = UX_PAYMENT_STATUS.processing;
    else if (gw.awaitsUser || opts.awaiting_user_hint === true) status = UX_PAYMENT_STATUS.awaiting_payment;
    else status = UX_PAYMENT_STATUS.pending;
  }

  const sv = UX_STATUS_VERSION[status] ?? 1;
  const next_action = deriveNextAction(status, {
    openQr: opts.open_qr === true,
    openRedirect: opts.open_redirect === true,
    failureRetryable: opts.failure_retryable === true && status === UX_PAYMENT_STATUS.failed,
  });

  let failure_hint_th = null;
  let failure_hint_en = null;
  if (status === UX_PAYMENT_STATUS.failed || status === UX_PAYMENT_STATUS.manual_review) {
    const h = failureHintsUx(failure_code, status, {});
    failure_hint_th = h.failure_hint_th;
    failure_hint_en = h.failure_hint_en;
  }

  return {
    payment_id: payment_id || 'unknown_payment',
    status,
    next_action,
    expires_at,
    display_amount,
    poll_after_ms: pollMsForStatus(status),
    failure_code,
    failure_hint_th,
    failure_hint_en,
    trace_id,
    status_version: sv,
  };
}

export function presentUxStripeIntentCreate(params = {}) {
  const payment_id = String(params.paymentIntentId || params.payment_id || '').trim();
  const display_amount =
    params.display_amount != null && params.display_amount !== '' ? String(params.display_amount) : '';
  const trace_id = params.trace_id != null ? String(params.trace_id) : `stripe_pi:${payment_id}`;
  return {
    payment_id,
    status: UX_PAYMENT_STATUS.awaiting_payment,
    next_action: UX_NEXT_ACTION.wait,
    expires_at: null,
    display_amount,
    poll_after_ms: POLL_MS_NON_TERMINAL,
    failure_code: null,
    failure_hint_th: null,
    failure_hint_en: null,
    trace_id,
    status_version: UX_STATUS_VERSION.awaiting_payment,
  };
}

export function presentUxImmediateCompleted(jobId, displayAmountThb, traceId) {
  return {
    payment_id: String(jobId),
    status: UX_PAYMENT_STATUS.completed,
    next_action: UX_NEXT_ACTION.none,
    expires_at: null,
    display_amount:
      displayAmountThb != null && displayAmountThb !== '' ? String(displayAmountThb) : String(jobId),
    poll_after_ms: 0,
    failure_code: null,
    failure_hint_th: null,
    failure_hint_en: null,
    trace_id: traceId || `wallet_ok:${jobId}`,
    status_version: UX_STATUS_VERSION.completed,
  };
}

/** Legacy / sparse merges → always emit full canonical tuple. Never leak raw gateway enums in `status`. */
export function normalizeUxPaymentPayload(partial = {}) {
  const ALLOWED_STATUS = Object.values(UX_PAYMENT_STATUS);
  const payment_id = partial.payment_id != null ? String(partial.payment_id) : '';
  let status = String(partial.status || UX_PAYMENT_STATUS.pending);
  if (!ALLOWED_STATUS.includes(status)) status = UX_PAYMENT_STATUS.pending;

  let next_action = String(partial.next_action || UX_NEXT_ACTION.wait);
  if (!Object.values(UX_NEXT_ACTION).includes(next_action)) next_action = UX_NEXT_ACTION.wait;

  const expires_at =
    partial.expires_at != null && String(partial.expires_at).trim() !== '' ? String(partial.expires_at) : null;
  const display_amount =
    partial.display_amount != null && String(partial.display_amount).trim() !== ''
      ? String(partial.display_amount)
      : '';

  const poll_after_ms = UX_TERMINAL_STATUSES.has(status)
    ? 0
    : partial.poll_after_ms != null && Number.isFinite(Number(partial.poll_after_ms))
      ? Math.max(0, Math.round(Number(partial.poll_after_ms)))
      : POLL_MS_NON_TERMINAL;

  let failure_code =
    partial.failure_code != null && String(partial.failure_code).trim() !== ''
      ? String(partial.failure_code).trim().slice(0, 96)
      : null;
  if (status !== UX_PAYMENT_STATUS.failed && status !== UX_PAYMENT_STATUS.manual_review) failure_code = null;

  let failure_hint_th = partial.failure_hint_th != null ? String(partial.failure_hint_th) : null;
  let failure_hint_en = partial.failure_hint_en != null ? String(partial.failure_hint_en) : null;
  if ((status === UX_PAYMENT_STATUS.failed || status === UX_PAYMENT_STATUS.manual_review) && failure_code) {
    const hints = failureHintsUx(failure_code, status, { failure_hint_th, failure_hint_en });
    failure_hint_th = hints.failure_hint_th;
    failure_hint_en = hints.failure_hint_en;
  }

  const trace_id =
    partial.trace_id != null && String(partial.trace_id).trim() !== ''
      ? String(partial.trace_id)
      : `payment_trace:${payment_id || '?'}`;

  let status_version =
    partial.status_version != null && Number.isFinite(Number(partial.status_version))
      ? Number(partial.status_version)
      : UX_STATUS_VERSION[status] ?? 1;
  /** Never below enum floor for normalized status */
  const floor = UX_STATUS_VERSION[status] ?? 1;
  if (status_version < floor) status_version = floor;

  return {
    payment_id,
    status,
    next_action,
    expires_at,
    display_amount,
    poll_after_ms: UX_TERMINAL_STATUSES.has(status) ? 0 : poll_after_ms,
    failure_code,
    failure_hint_th,
    failure_hint_en,
    trace_id,
    status_version,
  };
}

/**
 * Task 19C: async shadow audit for UX output (READ-ONLY; does not mutate presentUx return values).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   gatewayTransactionId: string,
 *   gatewayRow: object|null,
 *   projected: object,
 *   uxPayload: object,
 * }} payload
 */
export async function verifyCanonicalShadowForUxRead(client, payload) {
  const { auditCanonicalShadowForUxRead } = await import('./paymentCanonicalShadow.js');
  return auditCanonicalShadowForUxRead(client, payload);
}

/** Task 19D — presenter surface for controlled canonical reads telemetry (projection uses these). */
export {
  clearControlledReadTelemetry,
  getControlledReadTelemetry,
  isCanonicalReadsEnabled,
} from './paymentCanonicalShadow.js';
