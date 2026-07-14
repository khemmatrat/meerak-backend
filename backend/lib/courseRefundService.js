/**
 * Execute course refund — wallet credit, instructor reversal, ledger, enrollment revoke.
 */
import crypto from 'crypto';
import {
  evaluateCourseRefundEligibility,
  normalizeCourseRefundPolicy,
} from './courseRefundEngine.js';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function readCourseRefundPolicy(client) {
  try {
    const r = await client.query(`SELECT value_json FROM payout_config WHERE key = 'course_refund_policy' LIMIT 1`);
    const raw = r.rows?.[0]?.value_json;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

async function reverseInstructorNet(client, order) {
  const instructorNet = round2(order.instructor_net);
  if (!(instructorNet > 0) || !order.instructor_user_id) return { reversed: 0, source: 'none' };

  const payoutStatus = String(order.payout_status || 'held').toLowerCase();
  const instructor = await client.query(
    `SELECT id, wallet_pending, wallet_balance, wallet_balance_withdrawable
     FROM users WHERE id = $1::uuid FOR UPDATE`,
    [order.instructor_user_id],
  );
  if (!instructor.rows?.[0]) return { reversed: 0, source: 'instructor_missing' };

  if (payoutStatus === 'held') {
    const pending = round2(instructor.rows[0].wallet_pending);
    const claw = Math.min(instructorNet, pending);
    if (claw > 0) {
      await client.query(
        `UPDATE users SET wallet_pending = GREATEST(0, COALESCE(wallet_pending, 0) - $1), updated_at = NOW() WHERE id = $2::uuid`,
        [claw, order.instructor_user_id],
      );
    }
    return { reversed: claw, source: 'wallet_pending' };
  }

  const withdrawable = round2(instructor.rows[0].wallet_balance_withdrawable);
  const balance = round2(instructor.rows[0].wallet_balance);
  const clawWithdrawable = Math.min(instructorNet, withdrawable);
  const remaining = round2(instructorNet - clawWithdrawable);
  const clawBalance = Math.min(remaining, balance);

  if (clawWithdrawable > 0 || clawBalance > 0) {
    await client.query(
      `UPDATE users SET
         wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - $1),
         wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $2),
         updated_at = NOW()
       WHERE id = $3::uuid`,
      [clawWithdrawable, clawBalance, order.instructor_user_id],
    );
  }
  return {
    reversed: round2(clawWithdrawable + clawBalance),
    source: 'wallet_balance',
    shortfall: round2(Math.max(0, instructorNet - clawWithdrawable - clawBalance)),
  };
}

export async function executeCourseRefund(client, {
  orderId,
  requesterId,
  adminOverride = false,
  reasonCode = 'buyer_request',
  reasonNote = '',
}) {
  const policy = normalizeCourseRefundPolicy(await readCourseRefundPolicy(client));

  const orderRes = await client.query(
    `SELECT o.*, c.title AS course_title
     FROM course_purchase_orders o
     JOIN courses c ON c.id = o.course_id
     WHERE o.id = $1::uuid
     FOR UPDATE`,
    [orderId],
  );
  const order = orderRes.rows?.[0];
  if (!order) return { ok: false, code: 'order_not_found', error: 'ไม่พบคำสั่งซื้อ' };

  if (!adminOverride && String(order.user_id) !== String(requesterId)) {
    return { ok: false, code: 'forbidden', error: 'ไม่มีสิทธิ์คืนเงินรายการนี้' };
  }

  const enrollmentRes = await client.query(
    `SELECT * FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [order.user_id, order.course_id],
  );
  const enrollment = enrollmentRes.rows?.[0] || null;

  const eligibility = evaluateCourseRefundEligibility({
    order,
    enrollment,
    policy,
    adminOverride,
  });
  if (!eligibility.eligible) {
    return { ok: false, code: eligibility.code, error: eligibility.reason, eligibility };
  }

  const grossAmount = round2(order.gross_amount);
  const platformFee = round2(order.platform_fee);
  const instructorNet = round2(order.instructor_net);
  const refundLedgerId = `L-COURSE-REFUND-${orderId}`;

  const buyer = await client.query(
    `SELECT id, wallet_balance, wallet_balance_withdrawable FROM users WHERE id = $1::uuid FOR UPDATE`,
    [order.user_id],
  );
  if (!buyer.rows?.[0]) return { ok: false, code: 'buyer_not_found', error: 'ไม่พบผู้ซื้อ' };

  await client.query(
    `UPDATE users SET
       wallet_balance = COALESCE(wallet_balance, 0) + $1,
       wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1,
       updated_at = NOW()
     WHERE id = $2::uuid`,
    [grossAmount, order.user_id],
  );

  const instructorReversal = await reverseInstructorNet(client, order);

  await client.query(
    `INSERT INTO payment_ledger_audit (
       id, event_type, payment_id, gateway, job_id, amount, currency, status,
       bill_no, transaction_no, user_id, provider_id, metadata
     ) VALUES ($1, 'course_refund', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8, $9)`,
    [
      refundLedgerId,
      orderId,
      `COURSE-REFUND-${order.course_id}`,
      grossAmount,
      `CR-${String(orderId).slice(0, 8).toUpperCase()}`,
      `T-CR-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      order.user_id,
      order.instructor_user_id,
      JSON.stringify({
        leg: 'course_refund',
        course_id: order.course_id,
        course_title: order.course_title,
        order_id: orderId,
        gross_amount: grossAmount,
        platform_fee: platformFee,
        instructor_net: instructorNet,
        instructor_reversal: instructorReversal,
        progress_pct: eligibility.progressPct ?? 0,
        admin_override: !!adminOverride,
        reason_code: reasonCode,
      }),
    ],
  );

  if (platformFee > 0) {
    try {
      await client.query(
        `INSERT INTO platform_revenues (transaction_id, source_type, amount, gross_amount, metadata)
         VALUES ($1, 'course_commission', $2, $3, $4)`,
        [
          refundLedgerId,
          -platformFee,
          -grossAmount,
          JSON.stringify({
            reversal_of: order.ledger_id,
            order_id: orderId,
            course_id: order.course_id,
            leg: 'course_refund_reversal',
          }),
        ],
      );
    } catch (e) {
      console.warn('[courseRefundService] platform_revenues reversal skipped:', e?.message);
    }
  }

  await client.query(
    `UPDATE course_purchase_orders
     SET status = 'refunded',
         refund_status = 'completed',
         refunded_at = NOW(),
         refund_ledger_id = $2,
         payout_status = CASE WHEN payout_status = 'held' THEN 'reversed' ELSE payout_status END,
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $1::uuid`,
    [
      orderId,
      refundLedgerId,
      JSON.stringify({ refund: { eligibility, instructorReversal, reasonCode, reasonNote } }),
    ],
  );

  await client.query(
    `INSERT INTO course_refunds (
       order_id, user_id, course_id, instructor_user_id,
       gross_amount, platform_fee, instructor_net, progress_pct,
       reason_code, reason_note, admin_override, ledger_id, metadata
     ) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [
      orderId,
      order.user_id,
      order.course_id,
      order.instructor_user_id,
      grossAmount,
      platformFee,
      instructorNet,
      eligibility.progressPct ?? 0,
      reasonCode,
      reasonNote || null,
      !!adminOverride,
      refundLedgerId,
      JSON.stringify({ eligibility, instructorReversal }),
    ],
  );

  if (enrollment) {
    await client.query(`DELETE FROM course_lesson_progress WHERE user_id = $1::uuid AND course_id = $2`, [
      order.user_id,
      order.course_id,
    ]);
    await client.query(`DELETE FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2`, [
      order.user_id,
      order.course_id,
    ]);
    await client.query(
      `UPDATE courses SET total_enrolled = GREATEST(0, COALESCE(total_enrolled, 0) - 1) WHERE id = $1`,
      [order.course_id],
    );
  }

  return {
    ok: true,
    refundLedgerId,
    grossAmount,
    eligibility,
    instructorReversal,
  };
}

export { readCourseRefundPolicy };
