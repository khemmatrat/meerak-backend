/**
 * Ads campaign wallet billing with payment_ledger_audit (idempotent).
 */
import crypto from 'node:crypto';

export const OUTCOME_COST_MICRO = '50000'; // 0.05 THB

export const AD_CAMPAIGN_PACKAGES = {
  starter: {
    budgetMicro: '100000000',
    cpmMicro: '8000000',
    label: 'Starter 100 THB',
    billingModel: 'OUTCOME_ONLY',
    outcomeCostMicro: OUTCOME_COST_MICRO,
  },
  growth: {
    budgetMicro: '300000000',
    cpmMicro: '10000000',
    label: 'Growth 300 THB',
    billingModel: 'OUTCOME_ONLY',
    outcomeCostMicro: OUTCOME_COST_MICRO,
  },
  pro: {
    budgetMicro: '1000000000',
    cpmMicro: '15000000',
    label: 'Pro 1000 THB',
    billingModel: 'OUTCOME_ONLY',
    outcomeCostMicro: OUTCOME_COST_MICRO,
  },
};

export function microToThb(micro) {
  return Number(BigInt(micro || 0)) / 1_000_000;
}

export function objectiveToSurfaces(objective) {
  const map = {
    VIDEO_VIEWS: ['VIDEO_FEED'],
    STORY_VIEWS: ['STORY_VIEWER'],
    MARKETPLACE_LEADS: ['MARKETPLACE', 'SEARCH_RESULTS'],
    PROFILE_VISITS: ['PROVIDER_PROFILE_PROMO'],
    TRAFFIC: ['VIDEO_FEED', 'STORY_VIEWER', 'MARKETPLACE'],
  };
  return map[String(objective || 'TRAFFIC').toUpperCase()] || map.TRAFFIC;
}

/**
 * Charge user wallet for ad campaign spend.
 * @returns {{ ok: boolean, ledgerId?: string, chargedThb?: number, error?: string, balance?: number, required?: number }}
 */
export async function chargeAdCampaignWallet(client, { userId, amountThb, campaignRef, metadata = {} }) {
  const amount = Number(amountThb);
  if (!userId || !(amount > 0)) {
    return { ok: false, error: 'invalid_charge_params' };
  }

  const bal = await client.query(
    `SELECT COALESCE(wallet_balance, 0)::numeric AS bal FROM users WHERE id = $1::uuid FOR UPDATE`,
    [userId],
  );
  const balance = parseFloat(bal.rows[0]?.bal || 0);
  if (balance < amount) {
    return { ok: false, error: 'insufficient_balance', balance, required: amount };
  }

  const ledgerId = `L-ADS-${crypto.randomUUID()}`;
  const paymentId = campaignRef || ledgerId;

  await client.query(
    `UPDATE users SET
       wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1),
       wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - LEAST($1, COALESCE(wallet_balance_withdrawable, 0))),
       updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, userId],
  );

  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_campaign_spend', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      ledgerId,
      paymentId,
      `ADS-${String(paymentId).slice(0, 12)}`,
      amount,
      `ADS-${String(paymentId).slice(0, 8).toUpperCase()}`,
      `T-ADS-${Date.now()}`,
      userId,
      JSON.stringify({
        purpose: 'ad_campaign_spend',
        campaign_ref: campaignRef,
        charged_thb: amount,
        ...metadata,
      }),
    ],
  );

  return { ok: true, ledgerId, chargedThb: amount, paymentId };
}

/**
 * Refund ad campaign spend (e.g. creative rejected).
 */
export async function refundAdCampaignWallet(client, { userId, amountThb, originalLedgerId, reason }) {
  const amount = Number(amountThb);
  if (!userId || !(amount > 0)) {
    return { ok: false, error: 'invalid_refund_params' };
  }

  const refundId = `L-ADS-REF-${crypto.randomUUID()}`;

  await client.query(
    `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
    [amount, userId],
  );

  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_campaign_refund', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      refundId,
      originalLedgerId || refundId,
      `ADS-REF-${refundId.slice(-8)}`,
      amount,
      `ADSREF-${refundId.slice(-8).toUpperCase()}`,
      `T-ADSREF-${Date.now()}`,
      userId,
      JSON.stringify({
        purpose: 'ad_campaign_refund',
        original_ledger_id: originalLedgerId,
        reason: reason || 'campaign_rejected',
      }),
    ],
  );

  return { ok: true, refundId, refundedThb: amount };
}

/**
 * Log non-billable render failure (no wallet movement in MVP).
 */
export async function logNonBillableRenderEvent(client, { userId, creativeId, campaignId, reason, eventType }) {
  if (!userId) return { ok: false, error: 'missing_user' };
  const ledgerId = `L-ADS-NB-${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_render_failed_no_bill', $2, 'wallet', $3, 0, 'THB', 'completed', $4, $5, $6, $7)`,
    [
      ledgerId,
      campaignId || creativeId || ledgerId,
      `ADS-NB-${ledgerId.slice(-8)}`,
      `ADSNB-${ledgerId.slice(-8).toUpperCase()}`,
      `T-ADSNB-${Date.now()}`,
      userId,
      JSON.stringify({
        purpose: 'ad_render_failed_no_bill',
        creative_id: creativeId,
        campaign_id: campaignId,
        event_type: eventType,
        reason: reason || 'render_failed',
        billable: false,
      }),
    ],
  );
  return { ok: true, ledgerId };
}

/**
 * Credit micro-refund when creative render fails repeatedly.
 */
export async function creditFailedRenderRefund(client, {
  userId,
  amountThb,
  creativeId,
  campaignId,
  originalLedgerId,
  reason,
}) {
  const amount = Number(amountThb);
  if (!userId || !(amount > 0)) {
    return { ok: false, error: 'invalid_credit_params' };
  }

  const creditId = `L-ADS-RC-${crypto.randomUUID()}`;

  await client.query(
    `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
    [amount, userId],
  );

  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_render_credit', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      creditId,
      originalLedgerId || campaignId || creditId,
      `ADS-RC-${creditId.slice(-8)}`,
      amount,
      `ADSRC-${creditId.slice(-8).toUpperCase()}`,
      `T-ADSRC-${Date.now()}`,
      userId,
      JSON.stringify({
        purpose: 'ad_render_credit',
        creative_id: creativeId,
        campaign_id: campaignId,
        original_ledger_id: originalLedgerId,
        reason: reason || 'render_failure_credit',
      }),
    ],
  );

  return { ok: true, refundId: creditId, refundedThb: amount };
}

/**
 * Hold campaign budget in escrow (OUTCOME_ONLY) — wallet debited, not spent until verified outcome.
 */
export async function holdAdCampaignEscrow(client, {
  userId,
  amountThb,
  campaignRef,
  socialCampaignId,
  outcomeCostMicro = OUTCOME_COST_MICRO,
  metadata = {},
}) {
  const amount = Number(amountThb);
  if (!userId || !(amount > 0) || !campaignRef) {
    return { ok: false, error: 'invalid_escrow_params' };
  }

  const bal = await client.query(
    `SELECT COALESCE(wallet_balance, 0)::numeric AS bal FROM users WHERE id = $1::uuid FOR UPDATE`,
    [userId],
  );
  const balance = parseFloat(bal.rows[0]?.bal || 0);
  if (balance < amount) {
    return { ok: false, error: 'insufficient_balance', balance, required: amount };
  }

  const ledgerId = `L-ADS-ESC-${crypto.randomUUID()}`;
  const escrowMicro = BigInt(Math.round(amount * 1_000_000));

  await client.query(
    `UPDATE users SET
       wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1),
       wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - LEAST($1, COALESCE(wallet_balance_withdrawable, 0))),
       updated_at = NOW()
     WHERE id = $2::uuid`,
    [amount, userId],
  );

  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_campaign_escrow_hold', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      ledgerId,
      campaignRef,
      `ADS-ESC-${String(campaignRef).slice(0, 12)}`,
      amount,
      `ADSESC-${String(campaignRef).slice(0, 8).toUpperCase()}`,
      `T-ADSESC-${Date.now()}`,
      userId,
      JSON.stringify({
        purpose: 'ad_campaign_escrow_hold',
        campaign_ref: campaignRef,
        escrow_micro: escrowMicro.toString(),
        billing_model: 'OUTCOME_ONLY',
        ...metadata,
      }),
    ],
  );

  const esc = await client.query(
    `INSERT INTO ad_campaign_escrow (
      social_campaign_id, meerak_campaign_ref, user_id, escrow_micro, spent_micro,
      outcome_cost_micro, billing_model, hold_ledger_id, status
    ) VALUES ($1, $2, $3, $4, 0, $5, 'OUTCOME_ONLY', $6, 'active')
    RETURNING id`,
    [
      socialCampaignId || null,
      campaignRef,
      userId,
      escrowMicro.toString(),
      String(outcomeCostMicro),
      ledgerId,
    ],
  );

  return {
    ok: true,
    ledgerId,
    escrowId: esc.rows[0]?.id,
    heldThb: amount,
    escrowMicro: escrowMicro.toString(),
    billingModel: 'OUTCOME_ONLY',
  };
}

/**
 * Release remaining escrow back to wallet.
 */
export async function releaseAdCampaignEscrow(client, { campaignRef, reason = 'campaign_ended' }) {
  const row = await client.query(
    `SELECT * FROM ad_campaign_escrow WHERE meerak_campaign_ref = $1 AND status = 'active' FOR UPDATE`,
    [campaignRef],
  );
  const esc = row.rows[0];
  if (!esc) return { ok: false, error: 'escrow_not_found' };

  const remaining = BigInt(esc.escrow_micro) - BigInt(esc.spent_micro);
  if (remaining <= BigInt(0)) {
    await client.query(`UPDATE ad_campaign_escrow SET status = 'closed', updated_at = NOW() WHERE id = $1`, [esc.id]);
    return { ok: true, releasedThb: 0, remainingMicro: '0' };
  }

  const releaseThb = Number(remaining) / 1_000_000;
  const refundId = `L-ADS-ESCR-${crypto.randomUUID()}`;

  await client.query(
    `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
    [releaseThb, esc.user_id],
  );

  await client.query(
    `INSERT INTO payment_ledger_audit (
      id, event_type, payment_id, gateway, job_id, amount, currency, status,
      bill_no, transaction_no, user_id, metadata
    ) VALUES ($1, 'ad_campaign_escrow_release', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8)`,
    [
      refundId,
      campaignRef,
      `ADS-ESCR-${refundId.slice(-8)}`,
      releaseThb,
      `ADSESCR-${refundId.slice(-8).toUpperCase()}`,
      `T-ADSESCR-${Date.now()}`,
      esc.user_id,
      JSON.stringify({
        purpose: 'ad_campaign_escrow_release',
        campaign_ref: campaignRef,
        remaining_micro: remaining.toString(),
        reason,
      }),
    ],
  );

  await client.query(
    `UPDATE ad_campaign_escrow SET status = 'closed', updated_at = NOW() WHERE id = $1`,
    [esc.id],
  );

  return { ok: true, releasedThb: releaseThb, remainingMicro: remaining.toString(), refundId };
}

export async function getEscrowByCampaignRef(client, campaignRef) {
  const r = await client.query(
    `SELECT * FROM ad_campaign_escrow WHERE meerak_campaign_ref = $1 OR social_campaign_id = $1 LIMIT 1`,
    [campaignRef],
  );
  return r.rows[0] || null;
}

export async function getEscrowBySocialCampaignId(client, socialCampaignId) {
  const r = await client.query(
    `SELECT * FROM ad_campaign_escrow WHERE social_campaign_id = $1 LIMIT 1`,
    [socialCampaignId],
  );
  return r.rows[0] || null;
}

export async function linkEscrowSocialCampaignId(client, campaignRef, socialCampaignId) {
  await client.query(
    `UPDATE ad_campaign_escrow SET social_campaign_id = $2, updated_at = NOW() WHERE meerak_campaign_ref = $1`,
    [campaignRef, socialCampaignId],
  );
}
