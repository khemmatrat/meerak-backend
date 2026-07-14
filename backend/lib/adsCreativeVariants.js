/**
 * A/B creative variant runtime — register variants and pick delivery creative.
 */
import {
  createAdCreative,
  flattenCampaignCreatives,
  getAdCampaign,
  isAdsBridgeConfigured,
  updateAdCreativeMetadata,
} from './adsBridgeClient.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSyntheticVariantCreativeId(creativeId) {
  if (!creativeId) return true;
  const s = String(creativeId);
  if (s.includes('-variant-')) return true;
  return !UUID_RE.test(s);
}

export async function syncVariantCreativeToSocialCore({
  campaignId,
  variantKey,
  headline,
  body,
  metadata,
  primaryCreative,
  requireModeration = true,
}) {
  if (!isAdsBridgeConfigured()) return { ok: false, error: 'ads_not_configured' };
  const sc = await createAdCreative(campaignId, {
    headline: headline || primaryCreative?.headline || 'Variant',
    body: body || primaryCreative?.body || '',
    destinationUrl: primaryCreative?.destinationUrl || '/',
    promotedProviderUserId: primaryCreative?.promotedProviderUserId,
    metadata: {
      ...(metadata || {}),
      abVariant: variantKey,
      abCampaignId: campaignId,
    },
    requireModeration,
    variantKey,
  });
  return {
    ok: true,
    creativeId: sc.creativeId,
    moderationState: sc.moderationState,
  };
}

export async function listCampaignVariants(pool, campaignId) {
  const r = await pool.query(
    `SELECT * FROM ad_campaign_creative_variants
     WHERE campaign_id = $1 AND status = 'active'
     ORDER BY variant_key`,
    [campaignId],
  );
  return r.rows;
}

export async function registerCreativeVariant(pool, {
  campaignId,
  creativeId,
  variantKey = 'B',
  qualityScore,
  metadata = {},
}) {
  if (!campaignId || !creativeId) return { ok: false, error: 'missing_params' };
  const key = String(variantKey).toUpperCase().slice(0, 8);
  if (key === 'A') {
    await pool.query(
      `INSERT INTO ad_campaign_creative_variants (
        campaign_id, creative_id, variant_key, is_primary, quality_score, status, metadata
      ) VALUES ($1, $2, 'A', true, $3, 'active', $4::jsonb)
      ON CONFLICT (campaign_id, variant_key) DO UPDATE SET
        creative_id = EXCLUDED.creative_id,
        quality_score = COALESCE(EXCLUDED.quality_score, ad_campaign_creative_variants.quality_score),
        metadata = EXCLUDED.metadata`,
      [campaignId, creativeId, qualityScore ?? null, JSON.stringify(metadata)],
    );
    return { ok: true, variantKey: 'A', creativeId };
  }

  const r = await pool.query(
    `INSERT INTO ad_campaign_creative_variants (
      campaign_id, creative_id, variant_key, is_primary, quality_score, status, metadata
    ) VALUES ($1, $2, $3, false, $4, 'active', $5::jsonb)
    ON CONFLICT (campaign_id, variant_key) DO UPDATE SET
      creative_id = EXCLUDED.creative_id,
      quality_score = COALESCE(EXCLUDED.quality_score, ad_campaign_creative_variants.quality_score),
      metadata = EXCLUDED.metadata
    RETURNING *`,
    [campaignId, creativeId, key, qualityScore ?? null, JSON.stringify(metadata)],
  );

  await updateAdCreativeMetadata(creativeId, {
    ...metadata,
    abVariant: key,
    abCampaignId: campaignId,
  }).catch(() => null);

  return { ok: true, variant: r.rows[0] };
}

/**
 * Pick creative for A/B test — favors variant with fewer impressions (explore/exploit).
 */
export async function pickAbCreativeId(pool, campaignId, defaultCreativeId) {
  const variants = await listCampaignVariants(pool, campaignId);
  if (variants.length < 2) return { creativeId: defaultCreativeId, abActive: false };

  const sorted = [...variants].sort((a, b) => (a.impressions || 0) - (b.impressions || 0));
  const pick = sorted[0];
  return {
    creativeId: pick.creative_id || defaultCreativeId,
    abActive: true,
    variantKey: pick.variant_key,
    variantCount: variants.length,
  };
}

export async function recordVariantImpression(pool, campaignId, creativeId) {
  await pool
    .query(
      `UPDATE ad_campaign_creative_variants
     SET impressions = impressions + 1
     WHERE campaign_id = $1 AND creative_id = $2`,
      [campaignId, creativeId],
    )
    .catch(() => null);
}

export async function recordVariantClick(pool, campaignId, creativeId) {
  await pool
    .query(
      `UPDATE ad_campaign_creative_variants
     SET clicks = clicks + 1
     WHERE campaign_id = $1 AND creative_id = $2`,
      [campaignId, creativeId],
    )
    .catch(() => null);
}

function mergeCreativeIntoSlot(slot, creative, variantMeta = {}) {
  const meta = { ...(slot.metadata || {}), ...(creative?.metadata || {}), ...variantMeta };
  return {
    ...slot,
    creativeId: creative?.id || slot.creativeId,
    headline: creative?.headline || slot.headline,
    bodyPreview: creative?.bodyPreview || creative?.body || slot.bodyPreview,
    destinationUrl: creative?.destinationUrl || slot.destinationUrl,
    metadata: {
      ...meta,
      abVariant: variantMeta.abVariant || meta.abVariant,
    },
  };
}

/**
 * Wire A/B split at delivery — swap slot creative when variants are active.
 */
export async function applyAbSplitToSlots(pool, slots, { fetchCampaign = getAdCampaign } = {}) {
  if (!Array.isArray(slots) || !slots.length) return slots || [];

  const campaignCache = new Map();
  const variantCache = new Map();

  return Promise.all(
    slots.map(async (slot) => {
      const campaignId = slot?.campaignId;
      if (!campaignId) return slot;

      const pick = await pickAbCreativeId(pool, campaignId, slot.creativeId);
      if (!pick.abActive) {
        return { ...slot, abActive: false, abVariantKey: pick.variantKey || 'A' };
      }

      if (pick.creativeId === slot.creativeId) {
        return {
          ...slot,
          abActive: true,
          abVariantKey: pick.variantKey,
          metadata: { ...(slot.metadata || {}), abVariant: pick.variantKey },
        };
      }

      let variants = variantCache.get(campaignId);
      if (!variants) {
        variants = await listCampaignVariants(pool, campaignId);
        variantCache.set(campaignId, variants);
      }
      const variantRow = variants.find((v) => v.creative_id === pick.creativeId);
      const variantMeta = {
        ...(variantRow?.metadata || {}),
        abVariant: pick.variantKey,
      };

      let camp = campaignCache.get(campaignId);
      if (camp === undefined) {
        camp = fetchCampaign ? await fetchCampaign(campaignId).catch(() => null) : null;
        campaignCache.set(campaignId, camp);
      }
      const creative = flattenCampaignCreatives(camp).find((c) => c.id === pick.creativeId);

      if (creative) {
        return {
          ...mergeCreativeIntoSlot(slot, creative, variantMeta),
          abActive: true,
          abVariantKey: pick.variantKey,
        };
      }

      if (Object.keys(variantMeta).length > 1) {
        return {
          ...mergeCreativeIntoSlot(
            slot,
            {
              id: pick.creativeId,
              headline: variantMeta.headline || slot.headline,
              bodyPreview: variantMeta.bodyPreview || slot.bodyPreview,
              metadata: variantMeta,
            },
            variantMeta,
          ),
          creativeId: pick.creativeId,
          abActive: true,
          abVariantKey: pick.variantKey,
        };
      }

      return {
        ...slot,
        creativeId: pick.creativeId,
        metadata: { ...(slot.metadata || {}), ...variantMeta },
        abActive: true,
        abVariantKey: pick.variantKey,
      };
    }),
  );
}
