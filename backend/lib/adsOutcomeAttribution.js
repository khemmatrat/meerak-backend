/**
 * Last-click ad attribution + verified outcome hooks (server-side only).
 */
import { resolveSocialCoreIdentity } from './adsTargetingSignals.js';
import { processOutcomeBillable } from './adsOutcomeBilling.js';
import { getEscrowBySocialCampaignId } from './adsCampaignBilling.js';
import { getAdCampaign, isAdsBridgeConfigured, recordAdClick } from './adsBridgeClient.js';

const DEFAULT_WINDOW_DAYS = 30;

let _outcomeFraudDeps = { redis: null };

export function setOutcomeAttributionDeps({ redis } = {}) {
  if (redis) _outcomeFraudDeps.redis = redis;
}

async function resolveConversionWindowDays(_pool, campaignId) {
  if (!campaignId || !isAdsBridgeConfigured()) return DEFAULT_WINDOW_DAYS;
  try {
    const camp = await getAdCampaign(campaignId);
    const days = Number(camp?.campaign?.conversionWindowDays ?? camp?.conversionWindowDays);
    if (Number.isFinite(days) && days >= 1 && days <= 90) return Math.floor(days);
  } catch {
    /* fallback */
  }
  return DEFAULT_WINDOW_DAYS;
}

/**
 * Bind ad click from booking request (?ad_click= chain).
 */
export async function bindAdClickFromBooking(pool, {
  meerakUserId,
  adClickPublicId,
  adCampaignId,
  adCreativeId,
  adImpressionId,
  surface,
}) {
  if (!meerakUserId || !adClickPublicId) return { bound: false, reason: 'missing_click' };

  const existing = await pool.query(
    `SELECT * FROM ad_click_attribution WHERE public_click_id = $1 ORDER BY clicked_at DESC LIMIT 1`,
    [adClickPublicId],
  );
  const row = existing.rows[0];
  const campaignId = adCampaignId || row?.campaign_id;
  if (!campaignId) return { bound: false, reason: 'missing_campaign' };

  const windowDays = await resolveConversionWindowDays(pool, campaignId);
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + Math.max(1, windowDays));

  if (row) {
    await pool.query(
      `UPDATE ad_click_attribution
       SET meerak_user_id = $2, campaign_id = COALESCE($3, campaign_id),
           creative_id = COALESCE($4, creative_id), public_impression_id = COALESCE($5, public_impression_id),
           surface = COALESCE($6, surface), expires_at = $7, clicked_at = NOW()
       WHERE id = $1`,
      [row.id, meerakUserId, campaignId, adCreativeId || null, adImpressionId || null, surface || null, expires],
    );
    return { bound: true, refreshed: true, publicClickId: adClickPublicId };
  }

  await pool.query(
    `INSERT INTO ad_click_attribution (
      meerak_user_id, campaign_id, creative_id, public_impression_id, public_click_id, surface, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      meerakUserId,
      campaignId,
      adCreativeId || null,
      adImpressionId || null,
      adClickPublicId,
      surface || null,
      expires,
    ],
  );
  return { bound: true, created: true, publicClickId: adClickPublicId };
}

/**
 * Store click for last-touch attribution (called after successful ads click).
 */
export async function storeClickAttribution(pool, {
  meerakUserId,
  campaignId,
  creativeId,
  publicImpressionId,
  publicClickId,
  surface,
  windowDays = DEFAULT_WINDOW_DAYS,
}) {
  if (!meerakUserId || !campaignId || !publicClickId) return { stored: false };
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + Math.max(1, windowDays));
  await pool.query(
    `INSERT INTO ad_click_attribution (
      meerak_user_id, campaign_id, creative_id, public_impression_id, public_click_id, surface, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [meerakUserId, campaignId, creativeId || null, publicImpressionId || null, publicClickId, surface || null, expires],
  );
  return { stored: true, expiresAt: expires.toISOString() };
}

/**
 * Find last valid click attribution for a user.
 */
export async function findLastClickAttribution(pool, meerakUserId) {
  const r = await pool.query(
    `SELECT * FROM ad_click_attribution
     WHERE meerak_user_id = $1::uuid AND expires_at > NOW()
     ORDER BY clicked_at DESC LIMIT 1`,
    [meerakUserId],
  );
  return r.rows[0] || null;
}

/**
 * Bill verified outcome if last-click attribution exists and campaign uses OUTCOME_ONLY escrow.
 */
export async function attributeVerifiedOutcome(pool, {
  meerakUserId,
  conversionKind,
  outcomeKey,
  skipSelfAttributionUserId,
}) {
  if (!meerakUserId || !conversionKind || !outcomeKey) {
    return { attributed: false, reason: 'missing_params' };
  }

  const attr = await findLastClickAttribution(pool, meerakUserId);
  if (!attr) {
    return { attributed: false, reason: 'no_recent_ad_click' };
  }

  const esc = await getEscrowBySocialCampaignId(pool, attr.campaign_id);
  if (!esc || esc.billing_model !== 'OUTCOME_ONLY') {
    return { attributed: false, reason: 'not_outcome_billing_campaign' };
  }

  if (skipSelfAttributionUserId && String(skipSelfAttributionUserId) === String(esc.user_id)) {
    return { attributed: false, reason: 'self_attribution_blocked' };
  }

  try {
    const { assessOutcomeBillFraud } = await import('./adsFraudSignals.js');
    const fraud = await assessOutcomeBillFraud(_outcomeFraudDeps.redis, {
      meerakUserId,
      advertiserUserId: esc.user_id,
    });
    if (!fraud.allowed) {
      return { attributed: false, reason: fraud.reason || 'fraud_blocked', fraudScore: fraud.score };
    }
  } catch {
    /* non-blocking if redis unavailable */
  }

  const windowDays = await resolveConversionWindowDays(pool, attr.campaign_id);
  const clickedAt = attr.clicked_at ? new Date(attr.clicked_at) : null;
  if (clickedAt) {
    const maxAge = windowDays * 24 * 60 * 60 * 1000;
    if (Date.now() - clickedAt.getTime() > maxAge) {
      return { attributed: false, reason: 'conversion_window_expired' };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bill = await processOutcomeBillable(client, {
      campaignId: attr.campaign_id,
      meerakCampaignRef: esc.meerak_campaign_ref,
      conversionKind,
      outcomeKey,
      publicClickId: attr.public_click_id,
      publicImpressionId: attr.public_impression_id,
      viewerUserId: meerakUserId,
    });
    await client.query('COMMIT');
    try {
      const { bumpRealtimeCounter } = await import('./adsRealtimeCounters.js');
      await bumpRealtimeCounter(_outcomeFraudDeps.redis, attr.campaign_id, 'outcomes');
    } catch {
      /* optional */
    }
    return { attributed: bill.billed, ...bill, campaignId: attr.campaign_id };
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('[adsOutcomeAttribution]', e?.message || e);
    return { attributed: false, reason: e?.message || 'attribution_failed' };
  } finally {
    client.release();
  }
}

export async function onBookingConfirmed(pool, { bookingId, bookerId, talentId }) {
  if (!bookerId || !bookingId) return { attributed: false, reason: 'missing_booking' };
  return attributeVerifiedOutcome(pool, {
    meerakUserId: bookerId,
    conversionKind: 'BOOKING_CONFIRMED',
    outcomeKey: `booking:${bookingId}`,
    skipSelfAttributionUserId: talentId,
  });
}

export async function onJobHired(pool, { jobId, employerId, hiredUserId }) {
  if (!employerId || !jobId) return { attributed: false, reason: 'missing_job' };
  return attributeVerifiedOutcome(pool, {
    meerakUserId: employerId,
    conversionKind: 'JOB_HIRED',
    outcomeKey: `job_hire:${jobId}`,
    skipSelfAttributionUserId: hiredUserId,
  });
}

export async function onOrderPaid(pool, { orderId, buyerId, sellerId }) {
  if (!buyerId || !orderId) return { attributed: false, reason: 'missing_order' };
  return attributeVerifiedOutcome(pool, {
    meerakUserId: buyerId,
    conversionKind: 'ORDER_PAID',
    outcomeKey: `order:${orderId}`,
    skipSelfAttributionUserId: sellerId,
  });
}

export async function recordClickWithAttribution(pool, {
  publicImpressionId,
  meerakUserId,
  campaignId,
  creativeId,
  surface,
}) {
  if (!publicImpressionId) return null;
  const scId = meerakUserId ? await resolveSocialCoreIdentity(pool, meerakUserId) : null;
  const out = await recordAdClick({
    publicImpressionId,
    viewerIdentityId: scId || undefined,
    meerakViewerId: meerakUserId || undefined,
  });
  if (!out?.publicClickId || !meerakUserId || !campaignId) return out;

  const windowDays = await resolveConversionWindowDays(pool, campaignId);
  await storeClickAttribution(pool, {
    meerakUserId,
    campaignId,
    creativeId,
    publicImpressionId,
    publicClickId: out.publicClickId,
    surface,
    windowDays,
  }).catch(() => null);

  return out;
}
