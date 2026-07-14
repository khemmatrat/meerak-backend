/**
 * Outcome-only billing — deduct 0.05 THB from escrow per verified conversion.
 */
import crypto from 'node:crypto';

import { recordAdOutcomeBillable, recordAdConversion } from './adsBridgeClient.js';
import { enqueueAdsOutboxEvent } from './adsEventOutbox.js';
import { OUTCOME_COST_MICRO } from './adsCampaignBilling.js';

const VERIFIED_OUTCOME_KINDS = new Set(['BOOKING_CONFIRMED', 'ORDER_PAID', 'JOB_HIRED']);

/**
 * @returns {{ billed: boolean, reason?: string, costMicro?: string, ledgerId?: string }}
 */
export async function processOutcomeBillable(client, {
  campaignId,
  meerakCampaignRef,
  conversionKind,
  outcomeKey,
  publicClickId,
  publicImpressionId,
  viewerUserId,
  attributedValueMicro,
}) {
  if (!VERIFIED_OUTCOME_KINDS.has(conversionKind)) {
    return { billed: false, reason: 'not_verified_outcome' };
  }
  if (!campaignId || !outcomeKey) {
    return { billed: false, reason: 'missing_params' };
  }

  const escRow = await client.query(
    `SELECT * FROM ad_campaign_escrow
     WHERE (social_campaign_id = $1 OR meerak_campaign_ref = $2) AND status = 'active'
     FOR UPDATE`,
    [campaignId, meerakCampaignRef || campaignId],
  );
  const esc = escRow.rows[0];
  if (!esc) {
    return { billed: false, reason: 'no_active_escrow' };
  }

  const dup = await client.query(
    `SELECT id FROM ad_outcome_billable_log WHERE outcome_key = $1 LIMIT 1`,
    [outcomeKey],
  );
  if (dup.rows?.length) {
    return { billed: false, reason: 'outcome_already_billed' };
  }

  const costMicro = BigInt(esc.outcome_cost_micro || OUTCOME_COST_MICRO);
  const remaining = BigInt(esc.escrow_micro) - BigInt(esc.spent_micro);
  if (remaining < costMicro) {
    return { billed: false, reason: 'escrow_exhausted' };
  }

  let bridgeConv = null;
  let bridgeSpend = null;
  try {
    bridgeConv = await recordAdConversion({
      campaignId,
      conversionKind,
      conversionKey: outcomeKey,
      impressionPublicId: publicImpressionId,
      clickPublicId: publicClickId,
      attributedValueMicro: attributedValueMicro || costMicro.toString(),
      replaySourceEventKey: `meerak:outcome:${conversionKind}:${outcomeKey}`,
    });
    bridgeSpend = await recordAdOutcomeBillable({
      campaignId,
      conversionKind,
      outcomeKey,
      costMicro: costMicro.toString(),
      publicClickId,
      publicImpressionId,
    });
  } catch (e) {
    console.warn('[ads] outcome bridge:', e?.message || e);
    return { billed: false, reason: 'bridge_failed', error: e?.message };
  }

  const ledgerId = `L-ADS-OUT-${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_outcome_billable', $2, 'wallet', $3, 0, 'THB', 'completed', $4, $5, $6, $7)`,
    [
      ledgerId,
      campaignId,
      `ADS-OUT-${ledgerId.slice(-8)}`,
      `ADSOUT-${ledgerId.slice(-8).toUpperCase()}`,
      `T-ADSOUT-${Date.now()}`,
      esc.user_id,
      JSON.stringify({
        purpose: 'ad_outcome_billable',
        campaign_id: campaignId,
        conversion_kind: conversionKind,
        outcome_key: outcomeKey,
        cost_micro: costMicro.toString(),
        escrow: true,
        public_click_id: publicClickId,
        public_impression_id: publicImpressionId,
        bridge_conv: bridgeConv,
        bridge_spend: bridgeSpend,
      }),
    ],
  );

  await client.query(
    `INSERT INTO ad_outcome_billable_log (
      escrow_id, campaign_id, conversion_kind, outcome_key,
      public_click_id, public_impression_id, cost_micro, meerak_user_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      esc.id,
      campaignId,
      conversionKind,
      outcomeKey,
      publicClickId || null,
      publicImpressionId || null,
      costMicro.toString(),
      viewerUserId || null,
      JSON.stringify({ bridge_conv: bridgeConv, bridge_spend: bridgeSpend }),
    ],
  );

  const newSpent = BigInt(esc.spent_micro) + costMicro;
  const exhausted = newSpent >= BigInt(esc.escrow_micro);
  await client.query(
    `UPDATE ad_campaign_escrow SET spent_micro = $2, status = $3, updated_at = NOW() WHERE id = $1`,
    [esc.id, newSpent.toString(), exhausted ? 'exhausted' : 'active'],
  );

  await enqueueAdsOutboxEvent(client, {
    eventName: 'ad_outcome_billable',
    idempotencyKey: outcomeKey,
    payload: {
      campaignId,
      conversionKind,
      outcomeKey,
      costMicro: costMicro.toString(),
      viewerUserId,
      publicClickId,
      publicImpressionId,
    },
  });

  return { billed: true, ledgerId, costMicro: costMicro.toString(), exhausted, bridgeConv, bridgeSpend };
}

export async function listOutcomeBillableLog(pool, { campaignId, limit = 50, status } = {}) {
  const r = await pool.query(
    `SELECT * FROM ad_outcome_billable_log
     WHERE ($1::text IS NULL OR campaign_id = $1)
       AND ($3::text IS NULL OR status = $3)
     ORDER BY created_at DESC LIMIT $2`,
    [campaignId || null, Math.min(limit, 200), status || null],
  );
  return r.rows;
}

/**
 * Advertiser disputes a billable outcome (admin review).
 */
export async function disputeOutcomeBillable(pool, { outcomeId, userId, reason }) {
  const r = await pool.query(
    `UPDATE ad_outcome_billable_log o
     SET status = 'disputed', dispute_reason = $3, disputed_at = NOW()
     FROM ad_campaign_escrow e
     WHERE o.id = $1::uuid AND o.escrow_id = e.id AND e.user_id = $2::uuid
       AND o.status = 'billed'
     RETURNING o.*`,
    [outcomeId, userId, reason || 'advertiser_dispute'],
  );
  return r.rows[0] || null;
}

/**
 * Admin reverses a disputed/billed outcome — refunds escrow spend.
 */
export async function reverseOutcomeBillable(pool, { outcomeId, adminUserId, note }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await client.query(
      `SELECT o.*, e.user_id AS advertiser_id, e.escrow_micro, e.spent_micro, e.status AS escrow_status
       FROM ad_outcome_billable_log o
       JOIN ad_campaign_escrow e ON e.id = o.escrow_id
       WHERE o.id = $1::uuid AND o.status IN ('billed', 'disputed')
       FOR UPDATE`,
      [outcomeId],
    );
    const o = row.rows[0];
    if (!o) {
      await client.query('ROLLBACK');
      return { reversed: false, reason: 'not_found_or_already_reversed' };
    }

    const costMicro = BigInt(o.cost_micro || OUTCOME_COST_MICRO);
    const newSpent = BigInt(o.spent_micro) > costMicro ? BigInt(o.spent_micro) - costMicro : BigInt(0);
    const newEscrowStatus = newSpent < BigInt(o.escrow_micro) ? 'active' : o.escrow_status;

    await client.query(
      `UPDATE ad_outcome_billable_log
       SET status = 'reversed', reversed_at = NOW(), reversed_by = $2::uuid,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
       WHERE id = $1`,
      [outcomeId, adminUserId || null, JSON.stringify({ reverse_note: note || null })],
    );
    await client.query(
      `UPDATE ad_campaign_escrow SET spent_micro = $2, status = $3, updated_at = NOW() WHERE id = $1`,
      [o.escrow_id, newSpent.toString(), newEscrowStatus],
    );

    const ledgerId = `L-ADS-OUT-REV-${crypto.randomUUID()}`;
    await client.query(
      `INSERT INTO payment_ledger_audit (
        id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, user_id, metadata
      ) VALUES ($1, 'ad_campaign_escrow_release', $2, 'wallet', $3, 0, 'THB', 'completed', $4, $5, $6, $7)`,
      [
        ledgerId,
        o.campaign_id,
        `ADS-OUT-REV-${ledgerId.slice(-8)}`,
        `ADSOUTREV-${ledgerId.slice(-8).toUpperCase()}`,
        `T-ADSOUTREV-${Date.now()}`,
        o.advertiser_id,
        JSON.stringify({
          purpose: 'ad_outcome_reversed',
          outcome_id: outcomeId,
          outcome_key: o.outcome_key,
          refunded_micro: costMicro.toString(),
          note: note || null,
        }),
      ],
    );

    await client.query('COMMIT');
    return { reversed: true, outcomeId, refundedMicro: costMicro.toString() };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Admin rejects advertiser dispute — outcome stays billed.
 */
export async function rejectOutcomeDispute(pool, { outcomeId, adminUserId, note }) {
  const r = await pool.query(
    `UPDATE ad_outcome_billable_log
     SET status = 'billed', dispute_reason = NULL, disputed_at = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $1::uuid AND status = 'disputed'
     RETURNING *`,
    [
      outcomeId,
      JSON.stringify({
        dispute_rejected_at: new Date().toISOString(),
        dispute_rejected_by: adminUserId || null,
        dispute_rejected_note: note || null,
      }),
    ],
  );
  return r.rows[0] || null;
}
