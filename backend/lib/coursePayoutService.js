/**
 * Course instructor payout lifecycle — pending → withdrawable after hold window + WHT.
 */
import crypto from 'crypto';
import { normalizeCoursePayoutPolicy } from './courseRefundEngine.js';
import { postProviderWhtForEarning } from './providerWhtService.js';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export async function readCoursePayoutPolicy(client) {
  try {
    const r = await client.query(
      `SELECT value_json FROM payout_config WHERE key = 'course_payout_policy' LIMIT 1`,
    );
    const raw = r.rows?.[0]?.value_json;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export async function releaseEligibleCoursePayouts(client, { limit = 50, actorId = 'course_payout_release', orderId = null } = {}) {
  const policy = normalizeCoursePayoutPolicy(await readCoursePayoutPolicy(client));
  const params = [Math.max(1, Math.min(limit, 200))];
  let orderFilter = '';
  if (orderId) {
    params.push(orderId);
    orderFilter = ` AND o.id = $${params.length}::uuid`;
  }
  const pending = await client.query(
    `SELECT o.*
     FROM course_purchase_orders o
     WHERE o.status = 'completed'
       AND o.refund_status = 'none'
       AND o.payout_status = 'held'
       AND o.instructor_user_id IS NOT NULL
       AND o.instructor_net > 0
       AND COALESCE(o.payout_release_at, o.created_at) <= NOW()
       ${orderFilter}
     ORDER BY o.payout_release_at NULLS FIRST, o.created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    params,
  );

  const released = [];
  const blocked = [];
  for (const order of pending.rows || []) {
    const instructorNet = round2(order.instructor_net);
    if (!(instructorNet > 0)) continue;

    const payoutLedgerId = `L-COURSE-PAYOUT-${order.id}`;
    const existingLedger = await client.query(
      `SELECT id FROM payment_ledger_audit WHERE id = $1 LIMIT 1`,
      [payoutLedgerId],
    );
    if (existingLedger.rows?.[0]) {
      await client.query(
        `UPDATE course_purchase_orders
         SET payout_status = 'released', payout_released_at = COALESCE(payout_released_at, NOW()), payout_ledger_id = $2
         WHERE id = $1::uuid AND payout_status = 'held'`,
        [order.id, payoutLedgerId],
      );
      released.push({ orderId: order.id, ledgerId: payoutLedgerId, amount: instructorNet, idempotent: true });
      continue;
    }

    const instructor = await client.query(
      `SELECT id, wallet_pending, wallet_balance, wallet_balance_withdrawable
       FROM users WHERE id = $1::uuid FOR UPDATE`,
      [order.instructor_user_id],
    );
    if (!instructor.rows?.[0]) continue;

    const pendingBal = round2(instructor.rows[0].wallet_pending);
    const releaseAmount = Math.min(instructorNet, pendingBal);
    if (!(releaseAmount > 0)) {
      await client.query(
        `UPDATE course_purchase_orders SET payout_status = 'blocked', metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1::uuid`,
        [order.id, JSON.stringify({ payout_block_reason: 'insufficient_wallet_pending' })],
      );
      let courseTitle = '';
      try {
        const cr = await client.query(`SELECT title FROM courses WHERE id = $1 LIMIT 1`, [order.course_id]);
        courseTitle = cr.rows?.[0]?.title || '';
      } catch { /* ignore */ }
      blocked.push({
        orderId: order.id,
        instructorUserId: order.instructor_user_id,
        courseId: order.course_id,
        courseTitle,
        instructorNet,
        reason: 'insufficient_wallet_pending',
      });
      continue;
    }

    if (policy.releaseToWithdrawable) {
      await client.query(
        `UPDATE users SET
           wallet_pending = GREATEST(0, COALESCE(wallet_pending, 0) - $1),
           wallet_balance = COALESCE(wallet_balance, 0) + $1,
           wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1,
           updated_at = NOW()
         WHERE id = $2::uuid`,
        [releaseAmount, order.instructor_user_id],
      );
    } else {
      await client.query(
        `UPDATE users SET
           wallet_pending = GREATEST(0, COALESCE(wallet_pending, 0) - $1),
           wallet_balance = COALESCE(wallet_balance, 0) + $1,
           updated_at = NOW()
         WHERE id = $2::uuid`,
        [releaseAmount, order.instructor_user_id],
      );
    }

    let whtMeta = {};

    await client.query(
      `INSERT INTO payment_ledger_audit (
         id, event_type, payment_id, gateway, job_id, amount, currency, status,
         bill_no, transaction_no, user_id, provider_id, metadata
       ) VALUES ($1, 'course_instructor_payout', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8, $9)`,
      [
        payoutLedgerId,
        order.id,
        `COURSE-PAYOUT-${order.course_id}`,
        releaseAmount,
        `CP-${String(order.id).slice(0, 8).toUpperCase()}`,
        `T-CP-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        order.instructor_user_id,
        order.instructor_user_id,
        JSON.stringify({
          leg: 'course_instructor_payout_release',
          course_id: order.course_id,
          order_id: order.id,
          instructor_net: instructorNet,
          released_amount: releaseAmount,
          actor_id: actorId,
        }),
      ],
    );

    if (policy.applyProviderWht) {
      const whtPosting = await postProviderWhtForEarning(client, {
        sourceEventId: payoutLedgerId,
        sourceEventType: 'course_instructor_payout',
        providerUserId: order.instructor_user_id,
        grossIncomeAmount: releaseAmount,
        platformFeeAmount: round2(order.platform_fee),
        sourcePaymentId: order.id,
        sourceJobId: `COURSE-PAYOUT-${order.course_id}`,
        actorId,
        applyBalanceMutation: true,
      });
      const withheld = round2(whtPosting?.withheldAmount || 0);
      if (withheld > 0 && policy.releaseToWithdrawable) {
        await client.query(
          `UPDATE users SET
             wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - $1),
             updated_at = NOW()
           WHERE id = $2::uuid`,
          [withheld, order.instructor_user_id],
        );
      }
      whtMeta = {
        wht_withheld: withheld,
        wht_rate_percent: Number(whtPosting?.posting?.wht_rate_percent || 0),
        wht_net_released: round2(releaseAmount - withheld),
        wht_posting_id: whtPosting?.posting?.id || null,
        wht_eligibility: whtPosting?.eligibility?.status || whtPosting?.posting?.eligibility_status || null,
        wht_eligibility_reason: whtPosting?.eligibility?.reason || whtPosting?.posting?.eligibility_reason || null,
        earning_document_id: whtPosting?.posting?.earning_document_id || null,
        wht_certificate_document_id: whtPosting?.posting?.wht_certificate_document_id || null,
      };
      await client.query(
        `UPDATE payment_ledger_audit SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
        [payoutLedgerId, JSON.stringify(whtMeta)],
      );
    }

    await client.query(
      `UPDATE course_purchase_orders
       SET payout_status = 'released',
           payout_released_at = NOW(),
           payout_ledger_id = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
       WHERE id = $1::uuid`,
      [
        order.id,
        payoutLedgerId,
        JSON.stringify({
          payout_released_amount: releaseAmount,
          ...whtMeta,
        }),
      ],
    );

    released.push({
      orderId: order.id,
      ledgerId: payoutLedgerId,
      amount: releaseAmount,
      whtWithheld: whtMeta.wht_withheld || 0,
      netReleased: whtMeta.wht_net_released ?? releaseAmount,
    });
  }

  return { released, blocked, count: released.length, policy };
}
