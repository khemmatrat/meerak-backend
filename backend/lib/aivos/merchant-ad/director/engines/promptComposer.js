import crypto from 'crypto';
import {
  getPromptCatalog,
  resolveDimensionEntry,
  getDimensionVersion,
  getLanguageLibraryEntry,
  getProviderLibraryEntry,
  resolveIndustryAlias,
  resolveStyleAlias,
  resolvePromptVersion,
} from './promptConfigLoader.js';

const ENGINE_ID = 'prompt_composition_engine';
const ENGINE_VERSION = '2.1.0';

/**
 * @typedef {Object} PromptComposeInput
 * @property {string} format
 * @property {string} product_title
 * @property {string} [merchant_name]
 * @property {string} [business_type]
 * @property {string} [industry_id]
 * @property {string} [target_audience]
 * @property {string} [style_id]
 * @property {string} [campaign_goal]
 * @property {string} [language]
 * @property {string} [platform]
 * @property {number|null} [price_thb]
 * @property {string|null} [promo_text]
 * @property {string} [cta_id]
 * @property {string} [cta_intensity]
 * @property {string} [ai_provider]
 * @property {string} [prompt_version]
 * @property {string|null} [spoken_text]
 */

/**
 * @param {import('../types.js').DirectorRequest} request
 * @param {{ format: string, style_id?: string, category_id?: string, style?: object, script?: object, video_provider_id?: string }} context
 * @returns {PromptComposeInput}
 */
export function buildPromptComposeInput(request, context) {
  const guide = request.guide || {};
  const prompt_version = guide.prompt_version || request.prompt_version || null;
  const catalog = getPromptCatalog(prompt_version || undefined);
  const rawIndustry = context.category_id || request.category_id || guide.category_id || guide.industry || 'general';
  const industry_id = rawIndustry;

  let business_type = guide.business_type || request.business_type;
  if (!business_type) {
    const resolvedIndustry = resolveIndustryAlias(industry_id, catalog);
    if (['food', 'restaurant'].includes(resolvedIndustry)) business_type = 'food_shop';
    else if (['services', 'home_services', 'technician', 'real_estate', 'service'].includes(resolvedIndustry)) {
      business_type = 'service_provider';
    } else {
      business_type = catalog.default_business_type || 'marketplace';
    }
  }

  const ai_provider =
    guide.ai_provider ||
    request.ai_provider ||
    context.video_provider_id ||
    catalog.default_ai_provider;

  return {
    format: context.format,
    product_title: request.product_title || 'สินค้า',
    merchant_name: request.merchant_name || guide.merchant_name || 'ร้านค้า',
    business_type,
    industry_id,
    target_audience: request.target_audience || guide.target_audience || catalog.default_audience,
    style_id: context.style_id || request.style_id || guide.style_id || guide.style_preset || catalog.default_format_preset || 'friendly_seller',
    campaign_goal: guide.campaign_goal || guide.campaign || request.campaign_goal || guide.hook || catalog.default_campaign_goal,
    language: guide.language || request.language || catalog.default_language,
    platform: guide.platform || request.platform || catalog.default_platform,
    price_thb: request.price_thb ?? null,
    promo_text: request.promo_text ?? null,
    cta_id: guide.cta_id || request.cta_id || '_default',
    cta_intensity: guide.cta_intensity || request.cta_intensity || catalog.default_cta_intensity || 'soft',
    ai_provider,
    prompt_version: prompt_version || catalog.prompt_version || resolvePromptVersion().id,
    spoken_text: context.script?.full_text_th || null,
  };
}

function interpolate(template, slots) {
  if (!template || typeof template !== 'string') return '';
  return template
    .replace(/\{(\w+)\}/g, (_, key) => {
      const val = slots[key];
      return val != null && String(val).trim() ? String(val).trim() : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOffer(input, versionId) {
  const parts = [];
  if (input.price_thb != null && Number.isFinite(input.price_thb)) {
    const priceLabel = input.language === 'en' ? `Price ${Math.round(input.price_thb)} THB` : `ราคา ${Math.round(input.price_thb)} บาท`;
    parts.push(priceLabel);
  }
  if (input.promo_text?.trim()) {
    parts.push(input.promo_text.trim());
  }
  const campaign = resolveDimensionEntry('campaign_goals', input.campaign_goal, versionId);
  if (!parts.length && campaign.offer_framing) {
    parts.push(campaign.offer_framing);
  }
  return parts.join(' ').trim();
}

function resolveCtaText(input, versionId) {
  const cta = resolveDimensionEntry('ctas', input.cta_id, versionId);
  const lang = input.language === 'en' ? 'text_en' : 'text_th';
  const base = cta[lang] || cta.text_th || cta.text_en || '';

  const intensity = resolveDimensionEntry('cta_intensity', input.cta_intensity, versionId);
  const suffixKey = input.language === 'en' ? 'suffix_en' : 'suffix_th';
  const suffix = intensity[suffixKey] || '';
  if (!suffix) return base;
  return `${base} ${suffix}`.replace(/\s+/g, ' ').trim();
}

function buildSlots(input, catalog) {
  const versionId = input.prompt_version;
  const offer = formatOffer(input, versionId);
  const cta = resolveCtaText(input, versionId);
  const lang = getLanguageLibraryEntry(input.language, versionId);
  const spoken =
    input.spoken_text?.trim() ||
    interpolate(lang?.placeholder_spoken || '', {
      product: input.product_title,
      shop: input.merchant_name,
      offer,
      cta,
      promo: input.promo_text || '',
    });

  return { product: input.product_title, shop: input.merchant_name, offer, cta, promo: input.promo_text || '', spoken };
}

function buildLayers(input, slots, catalog) {
  const versionId = input.prompt_version;
  const resolvedIndustry = resolveIndustryAlias(input.industry_id, catalog);
  const resolvedStyle = resolveStyleAlias(input.style_id, catalog);

  const business = resolveDimensionEntry('business_types', input.business_type, versionId);
  const industry = resolveDimensionEntry('industries', resolvedIndustry, versionId);
  const audience = resolveDimensionEntry('audiences', input.target_audience, versionId);
  const style = resolveDimensionEntry('styles', resolvedStyle, versionId);
  const campaign = resolveDimensionEntry('campaign_goals', input.campaign_goal, versionId);
  const lang = getLanguageLibraryEntry(input.language, versionId);
  const platform = resolveDimensionEntry('platforms', input.platform, versionId);
  const providerDim = resolveDimensionEntry('providers', input.ai_provider, versionId);
  const providerLib = getProviderLibraryEntry(input.ai_provider, versionId);

  const spokenBody = interpolate(providerLib?.spoken_wrapper || '{spoken_instruction} Script: "{spoken}"', {
    spoken_instruction: lang?.spoken_instruction || '',
    spoken: slots.spoken,
  });

  const providerWrap = [providerLib?.prefix, providerLib?.suffix || providerDim.technical_suffix]
    .filter(Boolean)
    .join(' ');

  return {
    industry: industry.scene || industry.label_en || industry.label_th || '',
    style: style.motion || style.tone || '',
    audience: audience.tone_hint || audience.label_th || '',
    scene: [business.context, industry.scene].filter(Boolean).join(' '),
    motion: style.motion || lang?.motion_hint || '',
    spoken: spokenBody,
    tone: [style.tone, audience.tone_hint, lang?.tone_hint, campaign.hook_angle].filter(Boolean).join(' '),
    campaign: campaign.hook_angle || campaign.offer_framing || '',
    offer: slots.offer || campaign.offer_framing || '',
    cta: slots.cta,
    platform: platform.technical || '',
    provider_wrap: providerWrap,
    technical: providerDim.technical_suffix || providerLib?.suffix || '',
  };
}

function computeReproducibilityHash(input, catalogVersion) {
  const payload = {
    catalog_version: catalogVersion,
    prompt_version: input.prompt_version,
    engine_version: ENGINE_VERSION,
    dimensions: {
      business_type: input.business_type,
      industry_id: input.industry_id,
      target_audience: input.target_audience,
      style_id: input.style_id,
      campaign_goal: input.campaign_goal,
      language: input.language,
      platform: input.platform,
      cta_id: input.cta_id,
      cta_intensity: input.cta_intensity,
      ai_provider: input.ai_provider,
      format: input.format,
    },
    product_title: input.product_title,
    price_thb: input.price_thb,
    promo_text: input.promo_text,
    spoken_text: input.spoken_text,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function collectDimensionVersions(versionId) {
  const keys = [
    'business_types',
    'industries',
    'audiences',
    'styles',
    'campaign_goals',
    'platforms',
    'ctas',
    'cta_intensity',
    'providers',
  ];
  /** @type {Record<string, string>} */
  const versions = { language_library: versionId, provider_library: versionId };
  for (const key of keys) {
    versions[key] = getDimensionVersion(key, versionId);
  }
  return versions;
}

/**
 * @param {PromptComposeInput} input
 */
export function composePromptFromDimensions(input) {
  const versionId = input.prompt_version || resolvePromptVersion().id;
  const catalog = getPromptCatalog(versionId);
  const normalized = { ...input, prompt_version: versionId };

  if (normalized.format === 'tvc_multi_shot') {
    return {
      video: null,
      image: null,
      skipped: true,
      reason: 'tvc_uses_brief_engine',
      source: ENGINE_ID,
      engine_version: ENGINE_VERSION,
      catalog_version: catalog.version,
      prompt_version: versionId,
      dimensions: {
        business_type: normalized.business_type,
        industry_id: normalized.industry_id,
        target_audience: normalized.target_audience,
        style_preset: normalized.style_id,
        campaign_goal: normalized.campaign_goal,
        language: normalized.language,
        platform: normalized.platform,
        cta_id: normalized.cta_id,
        cta_intensity: normalized.cta_intensity,
        ai_provider: normalized.ai_provider,
      },
      dimension_versions: collectDimensionVersions(versionId),
      reproducibility_hash: computeReproducibilityHash(normalized, catalog.version),
      spoken_text_slot: null,
      fragments_used: [],
    };
  }

  const slots = buildSlots(normalized, catalog);
  const layers = buildLayers(normalized, slots, catalog);
  const recipe = catalog.composition_recipes[normalized.format] || catalog.composition_recipes.ugc_lipsync;
  const fragments_used = [];
  const parts = [];

  for (const layerKey of recipe) {
    const text = layers[layerKey];
    if (text) {
      parts.push(text);
      fragments_used.push(layerKey);
    }
  }

  const video = parts.join(catalog.layer_joiner || ' ').replace(/\s+/g, ' ').trim();

  return {
    video,
    image: layers.scene || null,
    source: ENGINE_ID,
    engine_version: ENGINE_VERSION,
    catalog_version: catalog.version,
    prompt_version: versionId,
    dimensions: {
      business_type: normalized.business_type,
      industry_id: normalized.industry_id,
      target_audience: normalized.target_audience,
      style_preset: normalized.style_id,
      campaign_goal: normalized.campaign_goal,
      language: normalized.language,
      platform: normalized.platform,
      cta_id: normalized.cta_id,
      cta_intensity: normalized.cta_intensity,
      ai_provider: normalized.ai_provider,
    },
    dimension_versions: collectDimensionVersions(versionId),
    slots,
    layers,
    fragments_used,
    spoken_text_slot: slots.spoken,
    reproducibility_hash: computeReproducibilityHash(normalized, catalog.version),
    skipped: false,
  };
}

export function getPromptEngineInfo(versionId) {
  const catalog = getPromptCatalog(versionId);
  const { id } = resolvePromptVersion(versionId);
  return {
    engine: ENGINE_ID,
    engine_version: ENGINE_VERSION,
    catalog_version: catalog.version,
    prompt_version: id,
    active_prompt_version: resolvePromptVersion().id,
  };
}

export { ENGINE_ID, ENGINE_VERSION };
