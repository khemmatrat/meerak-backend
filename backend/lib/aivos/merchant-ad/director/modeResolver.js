import { AD_FORMATS } from './types.js';

const UGC_CATEGORIES = new Set([
  'food',
  'beauty',
  'skincare',
  'services',
  'home_services',
  'technician',
  'real_estate',
  'automotive',
  'fashion',
  'healthcare',
  'marketplace',
  'general',
]);

const TVC_STYLE_IDS = new Set(['luxury_brand', 'premium']);

/**
 * Resolve generation mode — no provider-specific logic.
 * @param {import('./types.js').DirectorRequest} request
 * @returns {import('./types.js').AdFormat}
 */
export function resolveGenerationMode(request) {
  const guide = request.guide || {};
  const explicit = request.format || guide.format || guide.ad_format;
  if (explicit === AD_FORMATS.TVC || explicit === AD_FORMATS.UGC) {
    return explicit;
  }

  const styleId = request.style_id || guide.style_id || guide.styleId || '';
  if (TVC_STYLE_IDS.has(styleId)) {
    return AD_FORMATS.TVC;
  }

  const category =
    request.category_id ||
    guide.category_id ||
    guide.category_style ||
    guide.categoryStyle ||
    'general';

  if (UGC_CATEGORIES.has(category) && styleId !== 'luxury_brand') {
    return AD_FORMATS.UGC;
  }

  return AD_FORMATS.TVC;
}

export function resolveCategoryId(request) {
  const guide = request.guide || {};
  return (
    request.category_id ||
    guide.category_id ||
    guide.category_style ||
    guide.categoryStyle ||
    'general'
  );
}

export function resolveStyleId(request, format) {
  const guide = request.guide || {};
  if (request.style_id || guide.style_id || guide.styleId) {
    return request.style_id || guide.style_id || guide.styleId;
  }
  if (format === AD_FORMATS.TVC) return 'luxury_brand';
  const cat = resolveCategoryId(request);
  if (cat === 'food') return 'restaurant_owner';
  if (cat === 'beauty' || cat === 'skincare') return 'beauty_influencer';
  if (cat === 'fashion') return 'tiktok_creator';
  if (['services', 'real_estate', 'automotive', 'home_services', 'technician'].includes(cat)) {
    return 'professional_consultant';
  }
  return 'friendly_seller';
}
