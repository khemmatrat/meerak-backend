/**
 * Auto credit when render failures exceed threshold.
 */
import { creditFailedRenderRefund, logNonBillableRenderEvent } from './adsCampaignBilling.js';
import { getAdCampaign } from './adsBridgeClient.js';

const FAIL_THRESHOLD = Number(process.env.ADS_RENDER_FAIL_REFUND_THRESHOLD || 5);
const REFUND_THB = Number(process.env.ADS_RENDER_REFUND_THB || 1);

export async function creditRenderFailureIfNeeded(pool, {
  campaignId,
  creativeId,
  failCount,
  reason,
  viewerUserId,
}) {
  if (!campaignId || !creativeId || failCount < FAIL_THRESHOLD) {
    return { credited: false, reason: 'below_threshold' };
  }

  const client = await pool.connect();
  try {
    const dup = await client.query(
      `SELECT id FROM payment_ledger_audit
       WHERE event_type = 'ad_render_credit'
         AND metadata->>'creative_id' = $1
       LIMIT 1`,
      [creativeId],
    );
    if (dup.rows[0]) {
      return { credited: false, reason: 'already_credited' };
    }

    let userId = viewerUserId || null;
    let originalLedgerId = campaignId;

    if (!userId) {
      const camp = await getAdCampaign(campaignId).catch(() => null);
      const campMeta = camp?.campaign?.metadata || {};
      originalLedgerId = campMeta.billingLedgerId || campMeta.meerakCampaignRef || campaignId;
      const spend = await client.query(
        `SELECT user_id, id FROM payment_ledger_audit
         WHERE event_type = 'ad_campaign_spend'
           AND (payment_id = $1 OR id = $1 OR metadata->>'campaign_ref' = $1)
         ORDER BY created_at DESC LIMIT 1`,
        [String(originalLedgerId)],
      );
      userId = spend.rows[0]?.user_id || null;
      if (spend.rows[0]?.id) originalLedgerId = spend.rows[0].id;
    }

    if (!userId) {
      return { credited: false, reason: 'advertiser_not_found' };
    }

    await client.query('BEGIN');
    const credit = await creditFailedRenderRefund(client, {
      userId,
      amountThb: REFUND_THB,
      creativeId,
      campaignId,
      originalLedgerId,
      reason: reason || `render_fail_threshold:${failCount}`,
    });
    if (!credit.ok) {
      await client.query('ROLLBACK');
      return { credited: false, reason: credit.error || 'credit_failed' };
    }
    await client.query('COMMIT');
    return { credited: true, refundThb: REFUND_THB, refundId: credit.refundId };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[ads] creditRenderFailureIfNeeded:', e?.message || e);
    return { credited: false, reason: e?.message || 'error' };
  } finally {
    client.release();
  }
}

export async function logRenderFailureForViewer(pool, { userId, creativeId, campaignId, reason, eventType }) {
  if (!userId) return;
  const client = await pool.connect();
  try {
    await logNonBillableRenderEvent(client, {
      userId,
      creativeId,
      campaignId,
      reason,
      eventType,
    });
  } finally {
    client.release();
  }
}

export { FAIL_THRESHOLD, REFUND_THB };
