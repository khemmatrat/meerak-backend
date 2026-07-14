/**
 * Billable render events — audit ledger + Social Core spend accounting.
 */
import crypto from 'node:crypto';

import { impressionCostMicro } from './adsPacing.js';
import { recordAdBillableSpend } from './adsBridgeClient.js';
import { checkBillablePacingAllowed, incrementBillablePacing } from './adsRedisPacing.js';
import { enqueueAdsOutboxEvent } from './adsEventOutbox.js';

const BILLABLE_LEDGER_EVENTS = {
  ad_viewable_1s: 'ad_impression_billable',
  ad_video_view_2s: 'ad_video_view_billable',
};

function dedupeKey(publicImpressionId, eventType) {
  return `ads:billable:${publicImpressionId}:${eventType}`;
}

/**
 * @returns {{ billed: boolean, reason?: string, ledgerId?: string, spendMicro?: string }}
 */
export async function processBillableRenderEvent(client, redis, {
  eventType,
  publicImpressionId,
  creativeId,
  campaignId,
  cpmMicro,
  userId,
  dailyImpressionCap,
  hourlyImpressionCap,
}) {
  const ledgerEvent = BILLABLE_LEDGER_EVENTS[eventType];
  if (!ledgerEvent) {
    return { billed: false, reason: 'not_billable_event' };
  }

  const pacing = await checkBillablePacingAllowed(redis, {
    campaignId,
    dailyImpressionCap,
    hourlyImpressionCap,
  });
  if (!pacing.allowed) {
    return { billed: false, reason: pacing.reason || 'pacing_cap' };
  }

  if (redis) {
    const dk = dedupeKey(publicImpressionId, eventType);
    const set = await redis.set(dk, '1', 'EX', 86400, 'NX');
    if (set !== 'OK') {
      return { billed: false, reason: 'already_billed' };
    }
  }

  const costMicro = impressionCostMicro(cpmMicro);
  let bridge = null;
  try {
    bridge = await recordAdBillableSpend({
      publicImpressionId,
      eventType,
      creativeId,
      campaignId,
      costMicro: costMicro.toString(),
    });
  } catch (e) {
    console.warn('[ads] recordAdBillableSpend:', e?.message || e);
  }

  const ledgerId = `L-ADS-BILL-${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, $2, $3, 'wallet', $4, 0, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      ledgerId,
      ledgerEvent,
      campaignId || publicImpressionId,
      `ADS-BILL-${ledgerId.slice(-8)}`,
      `ADSBILL-${ledgerId.slice(-8).toUpperCase()}`,
      `T-ADSBILL-${Date.now()}`,
      userId || null,
      JSON.stringify({
        purpose: ledgerEvent,
        public_impression_id: publicImpressionId,
        creative_id: creativeId,
        campaign_id: campaignId,
        source_event: eventType,
        cost_micro: costMicro.toString(),
        prepaid: true,
        bridge,
      }),
    ],
  );

  await incrementBillablePacing(redis, campaignId);

  await enqueueAdsOutboxEvent(client, {
    eventName: ledgerEvent,
    idempotencyKey: `${publicImpressionId}:${eventType}`,
    payload: {
      publicImpressionId,
      creativeId,
      campaignId,
      sourceEvent: eventType,
      costMicro: costMicro.toString(),
      userId,
    },
  });

  return { billed: true, ledgerId, spendMicro: costMicro.toString(), bridge };
}
