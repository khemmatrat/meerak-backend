/**
 * HTTP client → AQOND Social Core Ads API (SSOT)
 */
import {
  isCircuitProtectedPath,
  recordCircuitFailure,
  recordCircuitSuccess,
  shouldSkipAdsBridgeCall,
} from './adsCircuitBreaker.js';

const DEFAULT_TIMEOUT_MS = 12000;

let _redis = null;

export function setAdsBridgeRedis(redis) {
  _redis = redis || null;
}

function baseUrls() {
  const u = process.env.SOCIAL_CORE_API_URL || process.env.ADS_API_URL || '';
  return String(u)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\//i.test(s));
}

function baseUrl() {
  return baseUrls()[0] || '';
}

function serviceKey() {
  return process.env.ADS_SERVICE_API_KEY || process.env.SOCIAL_CORE_SERVICE_KEY || '';
}

export function isAdsBridgeConfigured() {
  return !!(baseUrls().length && serviceKey());
}

/** Flatten creatives from list or get-campaign response shapes. */
export function flattenCampaignCreatives(campResponse) {
  if (!campResponse) return [];
  if (Array.isArray(campResponse.creatives) && campResponse.creatives.length) {
    return campResponse.creatives;
  }
  const groups = campResponse.campaign?.adGroups || campResponse.adGroups || [];
  return groups.flatMap((g) => g.creatives || []);
}

export function getFirstCampaignCreative(campResponse) {
  return flattenCampaignCreatives(campResponse)[0] || null;
}

export function findCampaignCreative(campResponse, creativeId) {
  if (!creativeId) return getFirstCampaignCreative(campResponse);
  return flattenCampaignCreatives(campResponse).find((c) => c.id === creativeId) || null;
}

function shouldTryNextBase(err) {
  if (!err) return true;
  if (err.name === 'AbortError') return false;
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') return true;
  const status = err.status;
  if (status === 404 || status === 502 || status === 503 || status === 504) return true;
  return false;
}

async function adsFetchOne(base, path, { method = 'GET', body, timeoutMs } = {}) {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Ads-Service-Key': serviceKey(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `ads_api_${res.status}`);
      err.status = res.status;
      err.data = data;
      err.url = url;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function adsFetch(path, options = {}) {
  const bases = baseUrls();
  if (!bases.length || !serviceKey()) {
    const err = new Error('ads_not_configured');
    err.status = 503;
    throw err;
  }

  if (await shouldSkipAdsBridgeCall(_redis, path)) {
    const err = new Error('ads_circuit_open');
    err.status = 503;
    err.circuitOpen = true;
    throw err;
  }

  let lastErr;
  for (const base of bases) {
    try {
      const data = await adsFetchOne(base, path, options);
      if (isCircuitProtectedPath(path)) {
        await recordCircuitSuccess(_redis);
      }
      return data;
    } catch (e) {
      lastErr = e;
      if (isCircuitProtectedPath(path) && shouldTryNextBase(e)) {
        await recordCircuitFailure(_redis);
      }
      if (!shouldTryNextBase(e)) throw e;
    }
  }
  if (isCircuitProtectedPath(path)) {
    await recordCircuitFailure(_redis);
  }
  throw lastErr;
}

export async function reserveAdPlacements(params) {
  return adsFetch('/ads/placements/reserve', { method: 'POST', body: params });
}

export async function recordAdClick(params) {
  return adsFetch('/ads/events/click', { method: 'POST', body: params });
}

export async function recordAdRenderEvent(params) {
  return adsFetch('/ads/events/render', { method: 'POST', body: params });
}

export async function recordAdConversion(params) {
  return adsFetch('/ads/events/conversion', { method: 'POST', body: params });
}

export async function recordAdBillableSpend(params) {
  return adsFetch('/ads/events/billable-spend', { method: 'POST', body: params });
}

export async function recordAdOutcomeBillable(params) {
  return adsFetch('/ads/events/outcome-billable', { method: 'POST', body: params });
}

export async function getAdCampaignInsightsV2(campaignId, range = '7d') {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/insights/v2?range=${encodeURIComponent(range)}`);
}

export async function compareAdCampaigns(ids) {
  const q = new URLSearchParams({ ids: ids.join(',') });
  return adsFetch(`/ads/campaigns/compare?${q.toString()}`);
}

export async function getAdsAudienceEstimate(params) {
  const q = new URLSearchParams();
  if (params.provinces) q.set('provinces', params.provinces);
  if (params.surfaces) q.set('surfaces', params.surfaces);
  return adsFetch(`/ads/audience/estimate?${q.toString()}`);
}

export async function exportAdCampaignInsights(campaignId, range = '30d') {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/export?range=${encodeURIComponent(range)}`);
}

export async function createAdCampaign(params) {
  return adsFetch('/ads/campaigns', { method: 'POST', body: params, timeoutMs: 20000 });
}

export async function createAdCreative(campaignId, params) {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/creatives`, {
    method: 'POST',
    body: params,
    timeoutMs: 20000,
  });
}

export async function createBoostVideoCampaign(params) {
  return adsFetch('/ads/campaigns/boost-video', { method: 'POST', body: params });
}

export async function listAdCampaigns(limit = 50, ownerUserId) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (ownerUserId) q.set('ownerUserId', ownerUserId);
  return adsFetch(`/ads/campaigns?${q.toString()}`);
}

export async function getAdCampaign(campaignId) {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}`);
}

export async function getAdCampaignInsights(campaignId) {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/insights`);
}

export async function setAdCampaignLifecycle(campaignId, lifecycleState) {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/lifecycle`, {
    method: 'PATCH',
    body: { lifecycleState },
  });
}

export async function activateAdCampaign(campaignId) {
  return adsFetch(`/ads/campaigns/${encodeURIComponent(campaignId)}/activate`, {
    method: 'PATCH',
  });
}

export async function getAdsReportingSummary(rangeDays = 7) {
  return adsFetch(`/ads/admin/reporting/summary?rangeDays=${rangeDays}`);
}

export async function listPendingAdCreatives(limit = 50) {
  return adsFetch(`/ads/admin/creatives/pending?limit=${limit}`);
}

export async function moderateAdCreative(creativeId, moderationState, moderationNote) {
  return adsFetch(`/ads/creatives/${encodeURIComponent(creativeId)}/moderation`, {
    method: 'PATCH',
    body: { moderationState, moderationNote },
  });
}

export async function updateAdCreativeMetadata(creativeId, metadata) {
  return adsFetch(`/ads/creatives/${encodeURIComponent(creativeId)}/metadata`, {
    method: 'PATCH',
    body: { metadata },
    timeoutMs: 20000,
  });
}

export async function seedHouseAds(platformOwnerUserId) {
  return adsFetch('/ads/admin/seed-house', {
    method: 'POST',
    body: { platformOwnerUserId },
  });
}
