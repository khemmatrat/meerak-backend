/**
 * Ad campaign spend handler — paymentBusinessActions registry.
 * Used when gateway payments confirm with purpose ad_campaign_spend.
 */
import { chargeAdCampaignWallet } from '../adsCampaignBilling.js';

function payMeta(payment) {
  const m = payment?.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}

function resolveUserId(payment, normalized) {
  const md = payMeta(payment);
  return (
    String(md.user_id || md.meerak_user_id || payment?.user_id || normalized?.client_reference_id || '').trim() ||
    null
  );
}

export async function validate(payment, normalized) {
  const userId = resolveUserId(payment, normalized);
  const amountMinor = Number(payment?.amount_minor || 0);
  const amountThb = amountMinor > 0 ? amountMinor / 100 : Number(payment?.amount || 0);
  if (!userId) return { ok: false, failure_code: 'ad_campaign_missing_user' };
  if (!(amountThb > 0)) return { ok: false, failure_code: 'ad_campaign_invalid_amount' };
  return { ok: true, userId, amountThb };
}

export async function execute(client, payment, normalized) {
  const v = await validate(payment, normalized);
  if (!v.ok) {
    const err = new Error(v.failure_code || 'ad_campaign_validate_failed');
    err.code = v.failure_code;
    err.nonRetryable = true;
    throw err;
  }

  const md = payMeta(payment);
  const campaignRef = String(md.campaign_ref || md.campaign_id || payment?.external_ref || '').trim() || null;

  const result = await chargeAdCampaignWallet(client, {
    userId: v.userId,
    amountThb: v.amountThb,
    campaignRef,
    metadata: md,
  });

  if (!result.ok) {
    const err = new Error(result.error || 'ad_campaign_charge_failed');
    err.code = result.error;
    err.nonRetryable = result.error === 'insufficient_balance';
    throw err;
  }

  return {
    ledger: { id: result.ledgerId, kind: 'payment_ledger_audit' },
    domainEvents: [
      {
        type: 'ads.campaign.charged',
        idempotency_key: `ad_campaign_spend:${result.ledgerId}`,
        payload: {
          user_id: v.userId,
          ledger_id: result.ledgerId,
          charged_thb: result.chargedThb,
          campaign_ref: campaignRef,
        },
        occurred_at: new Date().toISOString(),
      },
    ],
  };
}

export const adCampaignSpendHandler = { validate, execute };
