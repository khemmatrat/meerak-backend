/**
 * Course wallet purchase service — isolated from job/booking payment flows (Phase 3).
 */
import crypto from 'crypto';
import { computeCoursePurchaseQuote } from './courseFeeEngine.js';
import { tryGenerateCourseFiscalDrafts } from './courseFiscalService.js';
import { computePayoutReleaseAt } from './courseRefundEngine.js';
import { readCoursePayoutPolicy } from './coursePayoutService.js';
import { trackCourseFunnelEvent } from './courseFunnelAnalytics.js';
import { readCoursePolicy } from './courseMarketplaceShared.js';
import { buildInstallmentSchedule, computeInstallmentPlan } from './courseInstallmentEngine.js';
import { getTodayCoursePurchaseRank, notifyCoursePurchaseComplete } from './coursePurchaseReceiptNotifier.js';
import {
  applyConversionToQuote,
  buildCourseConversionMeta,
  redeemConversionOnPurchase,
} from './courseConversionService.js';
import { onOrderPaid } from './adsOutcomeAttribution.js';

export const COURSE_PURCHASE_SELF_DENIED_CODE = 'COURSE_PURCHASE_SELF';
export const COURSE_PURCHASE_SELF_DENIED_MESSAGE = 'ไม่สามารถซื้อคอร์สของตัวเองได้';

export const COURSE_PURCHASE_NOT_PUBLISHED_CODE = 'COURSE_PURCHASE_NOT_PUBLISHED';
export const COURSE_PURCHASE_NOT_PUBLISHED_MESSAGE = 'คอร์สนี้ยังไม่เปิดขาย';

export const COURSE_PURCHASE_GIFT_INVALID_CODE = 'COURSE_PURCHASE_GIFT_INVALID';
export const COURSE_PURCHASE_INSTALLMENT_DENIED_CODE = 'COURSE_PURCHASE_INSTALLMENT_DENIED';

/**
 * @param {{ instructor_user_id?: string | null, status?: string, is_marketplace?: boolean } | null | undefined} course
 * @param {string | null | undefined} buyerId
 * @param {{ isGift?: boolean }} [opts]
 */
export function evaluateCoursePurchaseGate(course, buyerId, opts = {}) {
  if (!course) {
    return { ok: false, httpStatus: 404, error: 'Course not found', code: 'COURSE_NOT_FOUND' };
  }
  if (!course.is_marketplace || course.status !== 'published') {
    return {
      ok: false,
      httpStatus: 400,
      error: COURSE_PURCHASE_NOT_PUBLISHED_MESSAGE,
      code: COURSE_PURCHASE_NOT_PUBLISHED_CODE,
    };
  }
  if (
    !opts.isGift &&
    course.instructor_user_id &&
    buyerId &&
    String(course.instructor_user_id) === String(buyerId)
  ) {
    return {
      ok: false,
      httpStatus: 403,
      error: COURSE_PURCHASE_SELF_DENIED_MESSAGE,
      code: COURSE_PURCHASE_SELF_DENIED_CODE,
    };
  }
  return { ok: true };
}

export function canAffordWalletPurchase(balance, grossAmount) {
  return Number(balance || 0) >= Number(grossAmount || 0);
}

export async function isCoachDirectPurchase(client, instructorId, buyerId) {
  if (!instructorId || !buyerId || String(instructorId) === String(buyerId)) return false;
  try {
    const r = await client.query(
      `SELECT 1 FROM coach_trainee_connections
       WHERE coach_id = $1::uuid AND trainee_id = $2::uuid AND status = 'active'
       LIMIT 1`,
      [instructorId, buyerId],
    );
    return !!r.rows?.[0];
  } catch {
    return false;
  }
}

export async function buildCoursePurchaseQuote(client, courseRow, buyerId, recipientUserId = null) {
  const policyRaw = await readCoursePolicy(client);
  const policy = { ...policyRaw };
  const override = Number(courseRow.platform_rate_override);
  if (Number.isFinite(override) && override >= 0 && override <= 0.9) {
    policy.platformRate = override;
  }
  const coachSubjectId = recipientUserId || buyerId;
  const isCoachDirect = await isCoachDirectPurchase(client, courseRow.instructor_user_id, coachSubjectId);
  const quote = computeCoursePurchaseQuote({
    priceThb: courseRow.price_thb,
    originalPriceThb: courseRow.original_price_thb,
    policy,
    isCoachDirect,
  });
  return { quote, isCoachDirect, policy };
}

async function loadBuyerWalletRow(client, buyerId) {
  try {
    const bal = await client.query(
      `SELECT wallet_balance, wallet_balance_withdrawable,
              wallet_credit_line_limit, wallet_credit_line_used
       FROM users WHERE id = $1::uuid LIMIT 1`,
      [buyerId],
    );
    return bal.rows?.[0] || {};
  } catch (e) {
    if (!String(e?.message || '').includes('wallet_credit_line')) throw e;
    const bal = await client.query(
      `SELECT wallet_balance, wallet_balance_withdrawable FROM users WHERE id = $1::uuid LIMIT 1`,
      [buyerId],
    );
    const row = bal.rows?.[0] || {};
    return { ...row, wallet_credit_line_limit: 0, wallet_credit_line_used: 0 };
  }
}

export async function buildPurchaseQuoteBundle(client, courseRow, buyerId, recipientUserId = null, opts = {}) {
  const { quote: baseQuote, isCoachDirect, policy } = await buildCoursePurchaseQuote(
    client,
    courseRow,
    buyerId,
    recipientUserId,
  );
  const conversionMeta = await buildCourseConversionMeta(client, client, {
    course: courseRow,
    userId: buyerId,
    policy,
    couponCode: opts.couponCode,
    voucherId: opts.voucherId,
    promoCode: opts.promoCode,
    recipientUserId,
  });
  const { quote, conversion } = await applyConversionToQuote(client, {
    baseQuote,
    policy,
    conversionMeta,
    voucherId: opts.voucherId,
    promoCode: opts.promoCode,
    userId: buyerId,
    courseId: courseRow.id,
  });
  let wallet = null;
  let installment = null;
  if (buyerId) {
    const row = await loadBuyerWalletRow(client, buyerId);
    const balance = Number(row.wallet_balance || 0);
    const required = Number(quote.grossAmount || 0);
    wallet = {
      balance,
      required,
      canAfford: canAffordWalletPurchase(balance, required),
      shortfall: Math.max(0, required - balance),
      creditLineLimit: Number(row.wallet_credit_line_limit || 0),
      creditLineUsed: Number(row.wallet_credit_line_used || 0),
    };
    installment = computeInstallmentPlan({
      grossAmount: required,
      walletBalance: balance,
      creditLineLimit: wallet.creditLineLimit,
      creditLineUsed: wallet.creditLineUsed,
      policy,
    });
  }
  return { quote, isCoachDirect, policy, wallet, installment, conversion, conversionMeta };
}

/**
 * Wallet / BNPL course purchase inside an open transaction.
 * @param {import('pg').PoolClient} client
 * @param {{ buyerId: string, courseId: string, recipientUserId?: string | null, giftMessage?: string, paymentMode?: string, installmentCount?: number }} opts
 */
export async function executeWalletCoursePurchase(client, opts) {
  const {
    buyerId,
    courseId,
    recipientUserId = null,
    giftMessage = '',
    paymentMode = 'wallet',
    installmentCount,
    couponCode = null,
    voucherId = null,
    promoCode = null,
    gatewayAmount = null,
    gatewayChargeId = null,
    gatewayPaymentId = null,
    gatewayName = 'payso',
  } = opts;

  const isGateway = paymentMode === 'gateway';

  const isGift = !!recipientUserId && String(recipientUserId) !== String(buyerId);
  const enrollUserId = isGift ? recipientUserId : buyerId;

  if (isGift) {
    const recipient = await client.query(`SELECT id, full_name FROM users WHERE id = $1::uuid LIMIT 1`, [enrollUserId]);
    if (!recipient.rows?.[0]) {
      return {
        ok: false,
        httpStatus: 400,
        error: 'ไม่พบผู้รับของขวัญ',
        code: COURSE_PURCHASE_GIFT_INVALID_CODE,
      };
    }
  }

  const courseRes = await client.query(
    `SELECT * FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published' FOR UPDATE`,
    [courseId],
  );
  const course = courseRes.rows?.[0];
  const gate = evaluateCoursePurchaseGate(course, buyerId, { isGift });
  if (!gate.ok) return gate;

  const enrollmentExisting = await client.query(
    `SELECT id FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [enrollUserId, course.id],
  );
  if (enrollmentExisting.rows?.[0]) {
    return {
      ok: true,
      alreadyEnrolled: true,
      enrollmentId: enrollmentExisting.rows[0].id,
      enrollUserId,
    };
  }

  const activeOrder = await client.query(
    `SELECT id FROM course_purchase_orders
     WHERE user_id = $1::uuid AND course_id = $2
       AND status NOT IN ('refunded', 'cancelled')
     LIMIT 1`,
    [enrollUserId, course.id],
  );
  if (activeOrder.rows?.[0]) {
    return {
      ok: true,
      alreadyEnrolled: true,
      orderId: activeOrder.rows[0].id,
      enrollUserId,
    };
  }

  const buyer = await client.query(
    `SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`,
    [buyerId],
  );
  if (!buyer.rows?.[0]) {
    return { ok: false, httpStatus: 404, error: 'User not found', code: 'USER_NOT_FOUND' };
  }
  const buyerWallet = await loadBuyerWalletRow(client, buyerId);
  const balance = Number(buyerWallet.wallet_balance || 0);
  const creditLineLimit = Number(buyerWallet.wallet_credit_line_limit || 0);
  const creditLineUsed = Number(buyerWallet.wallet_credit_line_used || 0);

  const { quote, isCoachDirect, policy, conversion } = await (async () => {
    const bundle = await buildPurchaseQuoteBundle(client, course, buyerId, enrollUserId, {
      couponCode,
      voucherId,
      promoCode,
    });
    return bundle;
  })();

  const useInstallment = !isGateway && paymentMode === 'installment';
  let walletCharge = Number(quote.grossAmount || 0);
  let creditPrincipal = 0;
  let installmentPlan = null;

  if (isGateway) {
    const expected = Number(gatewayAmount ?? quote.grossAmount);
    if (Math.abs(expected - Number(quote.grossAmount || 0)) > 0.02) {
      return {
        ok: false,
        httpStatus: 400,
        error: 'Gateway amount mismatch',
        code: 'COURSE_GATEWAY_AMOUNT_MISMATCH',
        quote,
      };
    }
    walletCharge = Number(quote.grossAmount || 0);
  } else if (useInstallment) {
    installmentPlan = computeInstallmentPlan({
      grossAmount: quote.grossAmount,
      walletBalance: balance,
      creditLineLimit,
      creditLineUsed,
      policy,
    });
    if (!installmentPlan.eligible) {
      return {
        ok: false,
        httpStatus: 402,
        error: installmentPlan.reason === 'insufficient_credit_line'
          ? 'วงเงินผ่อนชำระ (credit line) ไม่พอ'
          : 'คอร์สนี้ไม่รองรับการผ่อนชำระ',
        code: COURSE_PURCHASE_INSTALLMENT_DENIED_CODE,
        balance,
        installment: installmentPlan,
        quote,
      };
    }
    walletCharge = installmentPlan.walletDown;
    creditPrincipal = installmentPlan.creditPrincipal;
    if (!canAffordWalletPurchase(balance, walletCharge)) {
      return {
        ok: false,
        httpStatus: 402,
        error: 'Insufficient wallet balance for down payment',
        balance,
        required: walletCharge,
        quote,
        installment: installmentPlan,
      };
    }
  } else if (!canAffordWalletPurchase(balance, quote.grossAmount)) {
    return {
      ok: false,
      httpStatus: 402,
      error: 'Insufficient wallet balance',
      balance,
      required: quote.grossAmount,
      quote,
    };
  }

  const orderId = crypto.randomUUID();
  const ledgerId = `L-COURSE-${orderId}`;
  const bnplLedgerId = creditPrincipal > 0 ? `L-COURSE-BNPL-${orderId}` : null;
  const payoutPolicy = await readCoursePayoutPolicy(client);
  const payoutReleaseAt = computePayoutReleaseAt(new Date(), payoutPolicy);

  if (walletCharge > 0 && !isGateway) {
    await client.query(
      `UPDATE users SET
         wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1),
         wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - LEAST($1, COALESCE(wallet_balance_withdrawable, 0))),
         updated_at = NOW()
       WHERE id = $2::uuid`,
      [walletCharge, buyerId],
    );
  }

  if (creditPrincipal > 0) {
    await client.query(
      `UPDATE users SET
         wallet_credit_line_used = COALESCE(wallet_credit_line_used, 0) + $1,
         updated_at = NOW()
       WHERE id = $2::uuid`,
      [creditPrincipal, buyerId],
    );
  }

  if (course.instructor_user_id && quote.instructorNet > 0) {
    await client.query(
      `UPDATE users SET wallet_pending = COALESCE(wallet_pending, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
      [quote.instructorNet, course.instructor_user_id],
    );
  }

  const orderMetadata = {
    quote,
    payoutPolicy,
    isCoachDirect,
    paymentMode: isGateway ? 'gateway' : useInstallment ? 'installment' : 'wallet',
    purchased_by_user_id: buyerId,
    is_gift: isGift,
    gift_message: isGift ? String(giftMessage || '').slice(0, 500) : null,
    wallet_charge: isGateway ? 0 : walletCharge,
    credit_principal: creditPrincipal,
    conversion: conversion || null,
    ...(isGateway
      ? {
          gateway_charge_id: gatewayChargeId || null,
          gateway_payment_id: gatewayPaymentId || null,
          gateway_name: gatewayName || 'payso',
        }
      : {}),
  };

  const ledgerGateway = isGateway ? String(gatewayName || 'payso') : 'wallet';

  if (walletCharge > 0) {
    await client.query(
      `INSERT INTO payment_ledger_audit (
        id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, user_id, provider_id, metadata
      ) VALUES ($1, 'course_purchase', $2, $3, $4, $5, 'THB', 'completed', $6, $7, $8, $9, $10)`,
      [
        ledgerId,
        gatewayPaymentId || orderId,
        ledgerGateway,
        `COURSE-${course.id}`,
        walletCharge,
        `COURSE-${orderId.slice(0, 8).toUpperCase()}`,
        isGateway ? `T-GW-${Date.now()}` : `T-COURSE-${Date.now()}`,
        buyerId,
        course.instructor_user_id,
        JSON.stringify({
          ...orderMetadata,
          course_id: course.id,
          course_title: course.title,
          enroll_user_id: enrollUserId,
          gross_amount: quote.grossAmount,
          platform_fee: quote.platformFee,
          instructor_net: quote.instructorNet,
          leg: 'course_purchase',
        }),
      ],
    );
  }

  if (creditPrincipal > 0 && bnplLedgerId) {
    await client.query(
      `INSERT INTO payment_ledger_audit (
        id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, user_id, provider_id, metadata
      ) VALUES ($1, 'course_purchase_bnpl', $2, 'wallet_credit_line', $3, $4, 'THB', 'completed', $5, $6, $7, $8, $9, $10)`,
      [
        bnplLedgerId,
        orderId,
        `COURSE-${course.id}`,
        creditPrincipal,
        `BNPL-${orderId.slice(0, 8).toUpperCase()}`,
        `T-BNPL-${Date.now()}`,
        buyerId,
        course.instructor_user_id,
        JSON.stringify({
          ...orderMetadata,
          course_id: course.id,
          order_id: orderId,
          leg: 'course_purchase_bnpl',
        }),
      ],
    );
  }

  if (quote.platformFee > 0) {
    try {
      await client.query(
        `INSERT INTO platform_revenues (transaction_id, source_type, amount, gross_amount, metadata)
         VALUES ($1, 'course_commission', $2, $3, $4)`,
        [
          ledgerId,
          quote.platformFee,
          quote.grossAmount,
          JSON.stringify({
            course_id: course.id,
            order_id: orderId,
            platform_rate: quote.platformRate,
            payment_mode: isGateway ? 'gateway' : useInstallment ? 'installment' : 'wallet',
          }),
        ],
      );
    } catch (e) {
      console.warn('[coursePurchase] platform_revenues insert skipped:', e?.message);
    }
  }

  let order;
  try {
    order = await client.query(
      `INSERT INTO course_purchase_orders (
        id, user_id, course_id, instructor_user_id, gross_amount, platform_fee,
        instructor_net, currency, status, ledger_id, payout_status, payout_release_at, metadata
      ) VALUES ($1,$2::uuid,$3,$4::uuid,$5,$6,$7,'THB','completed',$8,'held',$9,$10::jsonb)
      RETURNING *`,
      [
        orderId,
        enrollUserId,
        course.id,
        course.instructor_user_id,
        quote.grossAmount,
        quote.platformFee,
        quote.instructorNet,
        ledgerId,
        payoutReleaseAt,
        JSON.stringify(orderMetadata),
      ],
    );
  } catch (e) {
    if (String(e?.code) === '23505') {
      const dup = await client.query(
        `SELECT id FROM course_purchase_orders
         WHERE user_id = $1::uuid AND course_id = $2 AND status NOT IN ('refunded', 'cancelled')
         LIMIT 1`,
        [enrollUserId, course.id],
      );
      return {
        ok: true,
        alreadyEnrolled: true,
        orderId: dup.rows?.[0]?.id || null,
        enrollUserId,
      };
    }
    throw e;
  }

  const redemption = await redeemConversionOnPurchase(client, {
    userId: buyerId,
    courseId: course.id,
    orderId,
    conversion,
    grossCharged: walletCharge,
  }).catch(() => ({ coupon: false, voucher: false, bonusPoints: 0 }));

  let installmentPlanRow = null;
  if (useInstallment && creditPrincipal > 0 && installmentPlan) {
    const count = Number(installmentCount || installmentPlan.installmentCount || 3);
    const schedule = buildInstallmentSchedule(creditPrincipal, count);
    const planRes = await client.query(
      `INSERT INTO course_installment_plans (
         order_id, buyer_id, course_id, total_amount, down_payment, credit_principal,
         installment_count, installment_amount, status, metadata
       ) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,'active',$9::jsonb)
       RETURNING *`,
      [
        orderId,
        buyerId,
        course.id,
        quote.grossAmount,
        walletCharge,
        creditPrincipal,
        count,
        installmentPlan.installmentAmount,
        JSON.stringify({ schedulePreview: schedule }),
      ],
    );
    installmentPlanRow = planRes.rows[0];
    for (const row of schedule) {
      await client.query(
        `INSERT INTO course_installment_payments (plan_id, seq, due_at, amount, status)
         VALUES ($1::uuid,$2,$3::timestamptz,$4,'pending')`,
        [installmentPlanRow.id, row.seq, row.dueAt, row.amount],
      );
    }
  }

  const enrollmentSource = isGift ? 'gift' : isGateway ? 'gateway' : useInstallment ? 'installment' : 'purchase';
  const enrollment = await client.query(
    `INSERT INTO course_enrollments (user_id, course_id, source)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (user_id, course_id) DO NOTHING
     RETURNING *`,
    [enrollUserId, course.id, enrollmentSource],
  );

  if (!enrollment.rows?.[0]) {
    return {
      ok: true,
      alreadyEnrolled: true,
      orderId: order.rows[0].id,
      enrollUserId,
    };
  }

  await client.query(
    `UPDATE courses SET total_enrolled = COALESCE(total_enrolled, 0) + 1 WHERE id = $1`,
    [course.id],
  );

  const todayRank = await getTodayCoursePurchaseRank(client, course.id);

  return {
    ok: true,
    order: order.rows[0],
    enrollment: enrollment.rows[0],
    quote,
    ledgerId,
    isCoachDirect,
    isGift,
    enrollUserId,
    installmentPlan: installmentPlanRow,
    paymentMode: isGateway ? 'gateway' : useInstallment ? 'installment' : 'wallet',
    socialProof: {
      todayRank,
      message:
        todayRank === 1
          ? 'คุณเป็นคนแรกที่ซื้อคอร์สนี้วันนี้'
          : `คุณเป็นคนที่ ${todayRank} ที่ซื้อคอร์สนี้วันนี้`,
    },
    conversion,
    bonusPoints: redemption?.bonusPoints || 0,
  };
}

export async function finalizeCoursePurchaseSideEffects(pool, payload) {
  const {
    buyerId,
    courseId,
    orderId,
    ledgerId,
    quote,
    order,
    course,
    isGift,
    recipientName,
    socialProof,
  } = payload;

  if (ledgerId) {
    tryGenerateCourseFiscalDrafts(pool, { ledgerId }).catch(() => {});
  }
  trackCourseFunnelEvent(pool, {
    userId: buyerId,
    courseId,
    eventType: 'course_purchase_completed',
    metadata: { order_id: orderId, gross: quote?.grossAmount, is_gift: !!isGift },
  }).catch(() => {});

  await notifyCoursePurchaseComplete(pool, {
    buyerId,
    orderId,
    courseId,
    order,
    course,
    quote,
    isGift,
    recipientName,
    todayRank: socialProof?.todayRank,
  }).catch(() => {});

  const sellerRow = await pool.query(
    `SELECT instructor_user_id FROM courses WHERE id = $1::uuid LIMIT 1`,
    [courseId],
  ).catch(() => ({ rows: [] }));
  onOrderPaid(pool, {
    orderId: String(orderId),
    buyerId,
    sellerId: sellerRow.rows?.[0]?.instructor_user_id || null,
  }).catch((e) => console.warn('[ads] order outcome attribution:', e?.message));

  return { socialProof };
}

export function formatPurchaseResponse(result) {
  if (result.alreadyEnrolled) {
    return {
      ok: true,
      alreadyEnrolled: true,
      enrollmentId: result.enrollmentId,
      orderId: result.orderId,
      enrollUserId: result.enrollUserId,
    };
  }
  return {
    ok: true,
    order: result.order,
    enrollment: result.enrollment,
    quote: result.quote,
    isCoachDirect: result.isCoachDirect,
    isGift: result.isGift,
    enrollUserId: result.enrollUserId,
    paymentMode: result.paymentMode,
    installmentPlan: result.installmentPlan,
    socialProof: result.socialProof,
    conversion: result.conversion || null,
    bonusPoints: result.bonusPoints || 0,
  };
}
