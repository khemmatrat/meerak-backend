/**
 * Escrow release on pause / expired campaigns.
 */
import { getAdCampaign, isAdsBridgeConfigured, listAdCampaigns, setAdCampaignLifecycle } from './adsBridgeClient.js';
import { releaseAdCampaignEscrow, getEscrowBySocialCampaignId } from './adsCampaignBilling.js';

export async function releaseEscrowForCampaignRef(pool, campaignRef, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await releaseAdCampaignEscrow(client, { campaignRef, reason });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

export async function releaseEscrowOnLifecycle(pool, { socialCampaignId, lifecycleState }) {
  if (!['PAUSED', 'ARCHIVED'].includes(lifecycleState)) return { released: false };
  let ref = null;
  const esc = await getEscrowBySocialCampaignId(pool, socialCampaignId);
  ref = esc?.meerak_campaign_ref;
  if (!ref) {
    const camp = await getAdCampaign(socialCampaignId).catch(() => null);
    ref = camp?.campaign?.metadata?.meerakCampaignRef;
  }
  if (!ref) return { released: false, reason: 'no_campaign_ref' };
  const reason = lifecycleState === 'PAUSED' ? 'campaign_paused' : 'campaign_archived';
  const out = await releaseEscrowForCampaignRef(pool, ref, reason);
  return { released: out.ok, ...out, reason };
}

export async function releaseExpiredCampaignEscrows(pool, { limit = 30 } = {}) {
  if (!isAdsBridgeConfigured()) return { processed: 0, released: 0 };
  const { campaigns = [] } = await listAdCampaigns(limit * 2).catch(() => ({ campaigns: [] }));
  const now = Date.now();
  let released = 0;
  const results = [];

  for (const c of campaigns) {
    if (results.length >= limit) break;
    const endAt = c.scheduledEndAt || c.campaign?.scheduledEndAt;
    if (!endAt) continue;
    const endMs = new Date(endAt).getTime();
    if (!Number.isFinite(endMs) || endMs > now) continue;
    if (c.lifecycleState === 'ARCHIVED') continue;

    try {
      await setAdCampaignLifecycle(c.id, 'ARCHIVED');
      const ref = c.metadata?.meerakCampaignRef || c.campaign?.metadata?.meerakCampaignRef;
      if (ref) {
        const out = await releaseEscrowForCampaignRef(pool, ref, 'campaign_expired');
        if (out.ok && Number(out.releasedThb || 0) > 0) released += 1;
        results.push({ campaignId: c.id, title: c.title, releasedThb: out.releasedThb || 0 });
      }
    } catch (e) {
      results.push({ campaignId: c.id, error: e?.message });
    }
  }

  return { processed: results.length, released, results };
}
