/**
 * Gateway course purchase handler — metadata.purpose = course_purchase
 * Fulfills via coursePurchaseGateway (same path as PaySo poll reconcile).
 */
import { fulfillCourseGatewayCharge } from '../coursePurchaseGateway.js';

function payMeta(payment) {
  const raw = payment?.metadata || payment?.raw_metadata || {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

function resolveUserId(payment, normalized) {
  const md = payMeta(payment);
  return (
    String(md.user_id || md.meerak_user_id || payment?.user_id || normalized?.client_reference_id || '').trim() ||
    null
  );
}

function resolveCourseId(payment) {
  const md = payMeta(payment);
  return String(md.course_id || payment?.client_reference_id || md.meerak_job_id || '').trim() || null;
}

function resolveChargeId(payment, normalized) {
  const md = payMeta(payment);
  return (
    String(md.charge_id || md.gateway_charge_id || payment?.external_ref || normalized?.payment_id || '').trim() ||
    null
  );
}

export async function validate(payment, normalized) {
  const meta = payMeta(payment);
  const userId = resolveUserId(payment, normalized);
  const courseId = resolveCourseId(payment);
  const chargeId = resolveChargeId(payment, normalized);
  if (!userId) return { ok: false, failure_code: 'course_purchase_missing_user' };
  if (!courseId) return { ok: false, failure_code: 'course_purchase_missing_course' };
  if (!chargeId) return { ok: false, failure_code: 'course_purchase_missing_charge' };
  const amountMinor = Number(payment?.amount_minor || 0);
  if (amountMinor <= 0) return { ok: false, failure_code: 'course_purchase_invalid_amount' };
  if (String(meta.purpose || '').toLowerCase().replace(/-/g, '_') !== 'course_purchase') {
    return { ok: false, failure_code: 'course_purchase_wrong_purpose' };
  }
  return { ok: true, userId, courseId, chargeId };
}

export async function execute(client, payment, normalized) {
  const v = await validate(payment, normalized);
  if (!v.ok) {
    const err = new Error(v.failure_code || 'course_purchase_validate_failed');
    err.code = v.failure_code;
    err.nonRetryable = true;
    throw err;
  }

  const paymentId =
    String(payment?.external_ref || payment?.id || normalized?.payment_id || v.chargeId || '').trim() ||
    v.chargeId;

  const result = await fulfillCourseGatewayCharge(client, {
    chargeId: v.chargeId,
    buyerId: v.userId,
    gatewayPaymentId: paymentId,
    gatewayName: String(payment?.provider || payment?.gateway || 'payso'),
  });

  if (!result.ok) {
    const err = new Error(result.error || 'course_purchase_fulfill_failed');
    err.code = result.code || 'COURSE_PURCHASE_FULFILL_FAILED';
    err.nonRetryable = result.httpStatus != null && result.httpStatus < 500;
    throw err;
  }

  const orderId = result.order?.id || result.orderId;
  const ledgerId = result.ledgerId;

  return {
    ledger: ledgerId ? { id: ledgerId, kind: 'payment_ledger_audit' } : null,
    orderId,
    enrollment: result.enrollment || null,
    domainEvents: [
      {
        type: 'course.purchase.completed',
        idempotency_key: `course_purchase:${paymentId}`,
        payload: {
          user_id: v.userId,
          course_id: v.courseId,
          charge_id: v.chargeId,
          payment_id: paymentId,
          order_id: orderId,
          ledger_id: ledgerId,
          payment_mode: 'gateway',
          trace_id: normalized?.trace_id || payment?.trace_id || null,
        },
        occurred_at: new Date().toISOString(),
      },
    ],
  };
}

export const coursePurchaseHandler = { validate, execute };
