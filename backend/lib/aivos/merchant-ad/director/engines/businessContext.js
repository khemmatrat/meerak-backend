import { getScriptConfig } from './scriptConfigLoader.js';

/**
 * Resolve business context — no strategy logic here.
 * @param {import('../types.js').DirectorRequest} request
 * @param {{ category_id: string, format?: string }} context
 */
export function resolveBusinessContext(request, context) {
  const guide = request.guide || {};
  const industry_id = context.category_id || request.category_id || guide.category_id || 'general';

  let business_type = guide.business_type || request.business_type;
  if (!business_type) {
    if (industry_id === 'food') business_type = 'food_shop';
    else if (['services', 'home_services', 'technician', 'real_estate'].includes(industry_id)) {
      business_type = 'service_provider';
    } else {
      business_type = 'marketplace';
    }
  }

  return {
    industry_id,
    business_type,
    product_title: request.product_title || 'สินค้า',
    merchant_name: request.merchant_name || guide.merchant_name || 'ร้านค้า',
    price_thb: request.price_thb ?? null,
    promo_text: request.promo_text?.trim() || null,
    target_audience: request.target_audience || guide.target_audience || 'all',
    language: guide.language || request.language || 'th',
    cta_id: guide.cta_id || request.cta_id || '_default',
    campaign_goal: guide.campaign_goal || guide.hook || null,
    format: context.format || guide.format || null,
    script_type: guide.script_type || request.script_type || null,
  };
}
