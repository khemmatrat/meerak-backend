/**
 * Course gateway purchase — PaySo PromptPay / card without wallet balance.
 * metadata.purpose = course_purchase (paymentCreationGuard pattern).
 */
import {
  createPaysoCardWalletDepositCharge,
  createPaysoWalletDepositCharge,
  queryPaysoWalletDepositStatus,
} from '../services/paysoService.js';
import { isPaysoEnabledFromEnv } from './paysoEnvFlag.js';
import { buildTransactionMetadata } from './paymentAdapter.js';
import { getLocalGatewayFromEnv, normalizePaymentChannel } from './paymentProviderGate.js';
import { publicPaymentExternalRef } from './paymentCreationGuard.js';
import {
  buildPurchaseQuoteBundle,
  evaluateCoursePurchaseGate,
  executeWalletCoursePurchase,
  finalizeCoursePurchaseSideEffects,
  formatPurchaseResponse,
} from './coursePurchaseService.js';
import { GATEWAY_TX_STATUS } from '../internal-gateway/constants.js';

const paysoAutoReconcileTimers = new Map();
const paysoChargeStatusLastCheckedAt = new Map();
const PAYSO_STATUS_COOLDOWN_MS = 8000;

export function buildCoursePurchaseGatewayMetadata({
  courseId,
  buyerId,
  chargeId,
  paymentChannel,
  extra = {},
}) {
  return buildTransactionMetadata({
    jobId: courseId,
    userId: buyerId,
    paymentChannel: normalizePaymentChannel(paymentChannel),
    paymentGateway: getLocalGatewayFromEnv(),
    extra: {
      course_id: String(courseId),
      meerak_user_id: String(buyerId),
      charge_id: chargeId,
      purpose: 'course_purchase',
      ...extra,
    },
  });
}

async function loadBuyerEmail(client, buyerId) {
  try {
    const r = await client.query(`SELECT email FROM users WHERE id = $1::uuid LIMIT 1`, [buyerId]);
    return String(r.rows?.[0]?.email || '').trim() || 'noreply@aqond.local';
  } catch {
    return 'noreply@aqond.local';
  }
}

async function insertGatewayMirrorRow(client, { chargeId, courseId, buyerId, amountMinor, metaObj }) {
  try {
    await client.query(
      `INSERT INTO gateway_transactions (
         external_ref, merchant_reference, amount_minor, currency, status, metadata, job_id, release_rules, fraud_flags
       ) VALUES ($1, $2, $3, 'THB', $4, $5::jsonb, $6, '{}'::jsonb, '{}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [chargeId, courseId, amountMinor, GATEWAY_TX_STATUS.PENDING, JSON.stringify(metaObj), courseId],
    );
  } catch (e) {
    if (String(e?.code) !== '42P01') {
      console.warn('[coursePurchaseGateway] gateway_transactions mirror skipped:', e?.message);
    }
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function createCoursePurchaseGatewayCharge(pool, opts) {
  const {
    buyerId,
    courseId,
    paymentMethod = 'promptpay',
    returnUrl,
    recipientUserId = null,
    giftMessage = '',
    couponCode = null,
    voucherId = null,
    promoCode = null,
  } = opts;

  const method = String(paymentMethod || 'promptpay').toLowerCase();
  if (!['promptpay', 'card'].includes(method)) {
    return { ok: false, httpStatus: 400, error: 'payment_method must be promptpay or card', code: 'INVALID_PAYMENT_METHOD' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const courseRes = await client.query(
      `SELECT * FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published' LIMIT 1`,
      [courseId],
    );
    const course = courseRes.rows?.[0];
    const gate = evaluateCoursePurchaseGate(course, buyerId, {
      isGift: !!(recipientUserId && recipientUserId !== buyerId),
    });
    if (!gate.ok) {
      await client.query('ROLLBACK');
      return gate;
    }

    const enrollUserId = recipientUserId || buyerId;
    const enr = await client.query(
      `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
      [enrollUserId, courseId],
    );
    if (enr.rows?.[0]) {
      await client.query('ROLLBACK');
      return { ok: false, httpStatus: 409, error: 'Already enrolled', code: 'ALREADY_ENROLLED' };
    }

    const bundle = await buildPurchaseQuoteBundle(client, course, buyerId, recipientUserId, {
      couponCode,
      voucherId,
      promoCode,
    });
    const gross = Number(bundle.quote?.grossAmount || 0);
    if (gross <= 0) {
      await client.query('ROLLBACK');
      return { ok: false, httpStatus: 400, error: 'Free course — use wallet purchase', code: 'COURSE_FREE_USE_WALLET' };
    }

    if (!isPaysoEnabledFromEnv()) {
      await client.query('ROLLBACK');
      return { ok: false, httpStatus: 503, error: 'Gateway payment not configured', code: 'GATEWAY_NOT_CONFIGURED' };
    }

    const customerEmail = await loadBuyerEmail(client, buyerId);
    const productDetail = `AQOND course ${String(course.title || courseId).slice(0, 200)}`.trim();
    let payso;
    if (method === 'card') {
      payso = await createPaysoCardWalletDepositCharge({
        amountThb: gross,
        userUuid: buyerId,
        customerEmail,
        returnUrl,
        productDetail,
      });
    } else {
      payso = await createPaysoWalletDepositCharge({
        amountThb: gross,
        userUuid: buyerId,
        customerEmail,
        productDetail,
      });
    }

    if (!payso?.ok || !payso.payso_reference_id) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        httpStatus: 502,
        error: payso?.error || 'Failed to create gateway charge',
        code: 'GATEWAY_CHARGE_FAILED',
      };
    }

    const chargeId = String(payso.payso_reference_id);
    const purchaseCtx = {
      recipientUserId,
      giftMessage,
      couponCode,
      voucherId,
      promoCode,
    };

    await client.query(
      `INSERT INTO course_purchase_gateway_charges (
         charge_id, user_id, course_id, amount, gross_amount, currency, status,
         source_type, payment_method, quote_json, purchase_ctx, gateway_external_ref
       ) VALUES ($1,$2::uuid,$3,$4,$5,'THB','pending','payso',$6,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (charge_id) DO NOTHING`,
      [
        chargeId,
        buyerId,
        courseId,
        gross,
        gross,
        method,
        JSON.stringify(bundle.quote),
        JSON.stringify(purchaseCtx),
        payso.payso_reference_id,
      ],
    );

    const metaObj = buildCoursePurchaseGatewayMetadata({
      courseId,
      buyerId,
      chargeId,
      paymentChannel: method,
      extra: {
        gross_amount: gross,
        quote: bundle.quote,
        payment_method: method,
      },
    });

    await insertGatewayMirrorRow(client, {
      chargeId,
      courseId,
      buyerId,
      amountMinor: Math.round(gross * 100),
      metaObj,
    });

    await client.query('COMMIT');

    scheduleCourseGatewayPaysoReconcile(pool, {
      chargeId,
      userId: buyerId,
      amount: gross,
    });

    return {
      ok: true,
      chargeId,
      courseId,
      amount: gross,
      grossAmount: gross,
      paymentMethod: method,
      purpose: 'course_purchase',
      status: 'pending',
      qr_code_url: payso.qr_code_url || null,
      authorization_uri: payso.authorization_uri || null,
      quote: bundle.quote,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Fulfill a paid gateway charge inside an open transaction.
 * @param {import('pg').PoolClient} client
 */
export async function fulfillCourseGatewayCharge(client, opts) {
  const {
    chargeId,
    buyerId,
    gatewayPaymentId = null,
    gatewayName = 'payso',
    transactionNoSuffix = '',
  } = opts;

  const chargeRes = await client.query(
    `SELECT * FROM course_purchase_gateway_charges WHERE charge_id = $1 FOR UPDATE`,
    [chargeId],
  );
  const charge = chargeRes.rows?.[0];
  if (!charge) {
    return { ok: false, httpStatus: 404, error: 'Charge not found', code: 'CHARGE_NOT_FOUND' };
  }
  if (buyerId && String(charge.user_id) !== String(buyerId)) {
    return { ok: false, httpStatus: 403, error: 'Charge user mismatch', code: 'CHARGE_USER_MISMATCH' };
  }
  if (charge.status === 'success' && charge.order_id) {
    return {
      ok: true,
      duplicate: true,
      alreadyFulfilled: true,
      orderId: charge.order_id,
      ledgerId: charge.ledger_id,
    };
  }

  const ctx = charge.purchase_ctx && typeof charge.purchase_ctx === 'object' ? charge.purchase_ctx : {};
  const result = await executeWalletCoursePurchase(client, {
    buyerId: charge.user_id,
    courseId: charge.course_id,
    recipientUserId: ctx.recipientUserId || null,
    giftMessage: ctx.giftMessage || '',
    paymentMode: 'gateway',
    couponCode: ctx.couponCode || null,
    voucherId: ctx.voucherId || null,
    promoCode: ctx.promoCode || null,
    gatewayAmount: Number(charge.gross_amount),
    gatewayChargeId: chargeId,
    gatewayPaymentId: gatewayPaymentId || chargeId,
    gatewayName,
  });

  if (!result.ok) return result;

  if (result.alreadyEnrolled) {
    await client.query(
      `UPDATE course_purchase_gateway_charges
       SET status = 'success', completed_at = NOW(), order_id = COALESCE(order_id, $2::uuid)
       WHERE charge_id = $1`,
      [chargeId, result.orderId || null],
    );
    return result;
  }

  await client.query(
    `UPDATE course_purchase_gateway_charges
     SET status = 'success', order_id = $2::uuid, ledger_id = $3, completed_at = NOW()
     WHERE charge_id = $1`,
    [chargeId, result.order.id, result.ledgerId],
  );

  try {
    await client.query(
      `UPDATE gateway_transactions SET status = 'paid', updated_at = NOW()
       WHERE external_ref = $1 OR merchant_reference = $2`,
      [chargeId, charge.course_id],
    );
  } catch {
    /* optional mirror */
  }

  return { ...result, chargeId, transactionNoSuffix };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function reconcileCourseGatewayChargeIfPaid(pool, { chargeId, userId, trigger = 'poll' }) {
  const key = String(chargeId || '').trim();
  if (!key) return { checked: false, reason: 'missing_charge_id' };

  const now = Date.now();
  const last = Number(paysoChargeStatusLastCheckedAt.get(key) || 0);
  if (trigger !== 'admin' && now - last < PAYSO_STATUS_COOLDOWN_MS) {
    return { checked: false, reason: 'cooldown' };
  }
  paysoChargeStatusLastCheckedAt.set(key, now);

  const row = await pool.query(
    `SELECT charge_id, user_id, course_id, amount, gross_amount, status, order_id, ledger_id, source_type
     FROM course_purchase_gateway_charges
     WHERE charge_id = $1
     LIMIT 1`,
    [key],
  );
  const charge = row.rows?.[0];
  if (!charge) return { checked: false, reason: 'charge_not_found' };
  if (userId && String(charge.user_id) !== String(userId)) {
    return { checked: false, reason: 'user_mismatch' };
  }
  if (charge.status === 'success' && charge.order_id) {
    return { checked: true, paid: true, duplicate: true, orderId: charge.order_id };
  }

  const q = await queryPaysoWalletDepositStatus({ referenceId: key });
  if (!q?.paid) {
    return { checked: true, paid: false, gatewayStatus: q?.status || null };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fulfillCourseGatewayCharge(client, {
      chargeId: key,
      buyerId: charge.user_id,
      gatewayPaymentId: key,
      gatewayName: charge.source_type || 'payso',
      transactionNoSuffix: String(q?.transaction_id || Date.now()),
    });
    if (!result.ok) {
      await client.query('ROLLBACK');
      return { checked: true, paid: true, fulfillError: result.error, code: result.code };
    }
    await client.query('COMMIT');

    if (!result.duplicate && !result.alreadyEnrolled && result.order) {
      const courseRow = await pool.query(`SELECT id, title FROM courses WHERE id = $1 LIMIT 1`, [charge.course_id]);
      let recipientName = null;
      if (result.isGift && result.enrollUserId) {
        const r = await pool.query(`SELECT full_name FROM users WHERE id = $1::uuid`, [result.enrollUserId]);
        recipientName = r.rows?.[0]?.full_name || null;
      }
      await finalizeCoursePurchaseSideEffects(pool, {
        buyerId: charge.user_id,
        courseId: charge.course_id,
        orderId: result.order.id,
        ledgerId: result.ledgerId,
        quote: result.quote,
        order: result.order,
        course: courseRow.rows?.[0],
        isGift: result.isGift,
        recipientName,
        socialProof: result.socialProof,
      });
    }

    return {
      checked: true,
      paid: true,
      fulfilled: true,
      response: formatPurchaseResponse(result),
      orderId: result.order?.id || result.orderId,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { checked: true, paid: true, fulfillError: e?.message || String(e) };
  } finally {
    client.release();
  }
}

export function scheduleCourseGatewayPaysoReconcile(pool, { chargeId, userId, amount, maxAttempts = 80, intervalMs = 8000 }) {
  const key = String(chargeId || '').trim();
  if (!key || paysoAutoReconcileTimers.has(key)) return;

  let attempts = 0;
  const stop = () => {
    const h = paysoAutoReconcileTimers.get(key);
    if (h) clearTimeout(h);
    paysoAutoReconcileTimers.delete(key);
  };

  const tick = async () => {
    attempts += 1;
    try {
      const rec = await reconcileCourseGatewayChargeIfPaid(pool, {
        chargeId: key,
        userId,
        trigger: 'auto',
      });
      if (rec?.paid && (rec?.fulfilled || rec?.duplicate)) {
        stop();
        return;
      }
      if (rec?.fulfillError || attempts >= maxAttempts) {
        stop();
        return;
      }
    } catch {
      if (attempts >= maxAttempts) stop();
    }
    const timer = setTimeout(tick, intervalMs);
    paysoAutoReconcileTimers.set(key, timer);
  };

  const timer = setTimeout(tick, 4000);
  paysoAutoReconcileTimers.set(key, timer);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getCourseGatewayChargeStatus(pool, { chargeId, userId }) {
  const row = await pool.query(
    `SELECT charge_id, user_id, course_id, amount, gross_amount, status, payment_method,
            order_id, ledger_id, created_at, completed_at
     FROM course_purchase_gateway_charges
     WHERE charge_id = $1 AND user_id = $2::uuid
     LIMIT 1`,
    [chargeId, userId],
  );
  const charge = row.rows?.[0];
  if (!charge) return null;

  let purchase = null;
  if (charge.status !== 'success') {
    const rec = await reconcileCourseGatewayChargeIfPaid(pool, {
      chargeId,
      userId,
      trigger: 'status_poll',
    });
    if (rec?.response) purchase = rec.response;
    else if (rec?.duplicate && charge.order_id) {
      purchase = { ok: true, orderId: charge.order_id };
    }
  }

  const fresh = await pool.query(
    `SELECT charge_id, user_id, course_id, amount, gross_amount, status, payment_method,
            order_id, ledger_id, created_at, completed_at
     FROM course_purchase_gateway_charges
     WHERE charge_id = $1 AND user_id = $2::uuid
     LIMIT 1`,
    [chargeId, userId],
  );
  const c = fresh.rows?.[0] || charge;

  return {
    chargeId: c.charge_id,
    courseId: c.course_id,
    amount: Number(c.amount),
    grossAmount: Number(c.gross_amount),
    status: c.status,
    paymentMethod: c.payment_method,
    orderId: c.order_id,
    ledgerId: c.ledger_id,
    createdAt: c.created_at,
    completedAt: c.completed_at,
    purpose: 'course_purchase',
    purchase: purchase || (c.order_id ? { ok: true, orderId: c.order_id } : null),
  };
}

export { publicPaymentExternalRef };
