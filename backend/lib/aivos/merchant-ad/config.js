/** AIVOS Merchant Ad Video module — Phase 21 extension (does not modify Phases 1–20). */

export const MERCHANT_AD_PHASE = 21;
export const MERCHANT_AD_SDK_VERSION = '21.1.0';

export function isMerchantAdEnabled() {
  return (
    process.env.AIVOS_MERCHANT_AD_ENABLED === '1' ||
    process.env.AIVOS_MERCHANT_AD_ENABLED === 'true'
  );
}

export function isFeatureEnabled(envKey) {
  return process.env[envKey] === '1' || process.env[envKey] === 'true';
}

export function isBriefEnabled() {
  return isMerchantAdEnabled() && isFeatureEnabled('AIVOS_MERCHANT_AD_BRIEF');
}

export function isImageGenEnabled() {
  return isMerchantAdEnabled() && isFeatureEnabled('AIVOS_MERCHANT_AD_IMAGE_GEN');
}

export function isVideoGenEnabled() {
  return isMerchantAdEnabled() && isFeatureEnabled('AIVOS_MERCHANT_AD_VIDEO_GEN');
}

/** Sprint 4 — Grok image-to-video per shot (requires XAI_API_KEY). */
export function isGrokVideoEnabled() {
  return isVideoGenEnabled() && isFeatureEnabled('AIVOS_MERCHANT_AD_GROK_VIDEO');
}

export function grokMaxShots() {
  const n = Number(process.env.AIVOS_MERCHANT_AD_GROK_MAX_SHOTS ?? 4);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.floor(n))) : 4;
}

export function merchantAdAspectRatio() {
  const ar = String(process.env.AIVOS_MERCHANT_AD_ASPECT || '9:16').trim();
  return ['9:16', '16:9', '1:1'].includes(ar) ? ar : '9:16';
}

export function isPublishEnabled() {
  return isMerchantAdEnabled() && isFeatureEnabled('AIVOS_MERCHANT_AD_PUBLISH');
}

export function weeklyClipLimit() {
  const n = Number(process.env.AIVOS_MERCHANT_AD_WEEKLY_LIMIT || 3);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 3;
}

export function allowedShopTypes() {
  return ['marketplace', 'food'];
}

export function shopTypeFromMerchantId(merchantId) {
  return String(merchantId).startsWith('food-') ? 'food' : 'marketplace';
}

export function isMerchantAllowed(merchantId) {
  if (!merchantId) return false;
  return allowedShopTypes().includes(shopTypeFromMerchantId(merchantId));
}
