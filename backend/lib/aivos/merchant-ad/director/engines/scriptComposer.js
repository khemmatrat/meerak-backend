import crypto from 'crypto';
import { getScriptCatalog, getScriptConfig, getScriptConfigVersion } from './scriptConfigLoader.js';

const ENGINE_ID = 'script_strategy_engine';
const ENGINE_VERSION = '3.0.0';

function interpolate(template, slots, lang = 'th') {
  if (!template) return '';
  const text = typeof template === 'string' ? template : template[lang] || template.th || template.en || '';
  return text
    .replace(/\{(\w+)\}/g, (_, key) => {
      const val = slots[key];
      return val != null && String(val).trim() ? String(val).trim() : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveScriptType(businessContext, catalog) {
  if (businessContext.script_type) return businessContext.script_type;
  if (businessContext.format && catalog.format_to_script_type[businessContext.format]) {
    return catalog.format_to_script_type[businessContext.format];
  }
  return catalog.default_script_type;
}

function buildSlots(businessContext, marketingStrategy, emotionalStrategy) {
  const segments = getScriptConfig('script_segments');
  const lang = businessContext.language === 'en' ? 'en' : 'th';
  const benefit =
    segments.layers.solution.benefits_by_industry[businessContext.industry_id]?.[lang] ||
    segments.layers.solution.benefits_by_industry._default[lang];

  let offer = '';
  if (businessContext.price_thb != null && Number.isFinite(businessContext.price_thb)) {
    offer = interpolate(segments.layers.offer.with_price, {
      price: Math.round(businessContext.price_thb),
      promo: businessContext.promo_text || '',
    }, lang);
  } else if (businessContext.promo_text) {
    offer = interpolate(segments.layers.offer.no_price, { promo: businessContext.promo_text }, lang);
  }

  const ctaEntry = segments.layers.cta.by_id[businessContext.cta_id] || segments.layers.cta.by_id._default;

  return {
    product: businessContext.product_title,
    shop: businessContext.merchant_name,
    price: businessContext.price_thb != null ? String(Math.round(businessContext.price_thb)) : '',
    promo: businessContext.promo_text || '',
    benefit,
    strategy_primary: marketingStrategy.primary.label_th,
    strategy_secondary: marketingStrategy.secondary.label_th,
    emotion_primary: emotionalStrategy.primary.label_th,
    emotion_secondary: emotionalStrategy.secondary.label_th,
    cta: ctaEntry[lang] || ctaEntry.th,
  };
}

function composeLayer(layerKey, slots, businessContext, marketingStrategy, emotionalStrategy) {
  const segments = getScriptConfig('script_segments');
  const lang = businessContext.language === 'en' ? 'en' : 'th';
  const layer = segments.layers[layerKey];
  if (!layer) return '';

  if (layerKey === 'hook') {
    const hookTpl =
      layer.by_strategy[marketingStrategy.primary_id] || layer.by_strategy._default;
    return interpolate(hookTpl, slots, lang);
  }
  if (layerKey === 'pain') {
    const painTpl = layer.by_audience[businessContext.target_audience] || layer.by_audience._default;
    return interpolate(painTpl, slots, lang);
  }
  if (layerKey === 'solution') {
    return interpolate(layer, slots, lang);
  }
  if (layerKey === 'offer') {
    return slots.promo || slots.price
      ? slots.price
        ? interpolate(layer.with_price, { price: slots.price, promo: slots.promo }, lang)
        : interpolate(layer.no_price, { promo: slots.promo }, lang)
      : '';
  }
  if (layerKey === 'cta') {
    return slots.cta;
  }
  if (layerKey === 'business' || layerKey === 'strategy' || layerKey === 'emotion') {
    return interpolate(layer, slots, lang);
  }
  return interpolate(layer, slots, lang);
}

function computeHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

/**
 * Compose full script from layered strategy pipeline.
 */
export function composeScript({
  businessContext,
  marketingStrategy,
  emotionalStrategy,
}) {
  const catalog = getScriptCatalog();
  const scriptTypes = getScriptConfig('script_types');
  const scriptType = resolveScriptType(businessContext, catalog);
  const typeConfig = scriptTypes.types[scriptType] || scriptTypes.types.ugc;

  const slots = buildSlots(businessContext, marketingStrategy, emotionalStrategy);
  const layers = {};
  const include = new Set(typeConfig.include_layers || catalog.layer_order);

  for (const key of catalog.layer_order) {
    if (!include.has(key)) continue;
    layers[key] = composeLayer(key, slots, businessContext, marketingStrategy, emotionalStrategy);
  }

  const spokenKeys = typeConfig.spoken_layers || ['hook', 'pain', 'solution', 'offer', 'cta'];
  const spokenParts = spokenKeys.map((k) => layers[k]).filter(Boolean);
  const full_text_th = spokenParts.join(catalog.layer_joiner_th || ' ').replace(/\s+/g, ' ').trim();
  const word_count = full_text_th ? full_text_th.split(/\s+/).length : 0;

  const dimensionPayload = {
    catalog_version: catalog.version,
    script_type: scriptType,
    industry_id: businessContext.industry_id,
    business_type: businessContext.business_type,
    strategy_primary: marketingStrategy.primary_id,
    strategy_secondary: marketingStrategy.secondary_id,
    language: businessContext.language,
  };

  return {
    source: ENGINE_ID,
    engine_version: ENGINE_VERSION,
    catalog_version: catalog.version,
    script_type: scriptType,
    business_context: businessContext,
    marketing_strategy: {
      primary_id: marketingStrategy.primary_id,
      secondary_id: marketingStrategy.secondary_id,
      primary_label_th: marketingStrategy.primary.label_th,
      secondary_label_th: marketingStrategy.secondary.label_th,
    },
    emotional_strategy: {
      primary_id: emotionalStrategy.primary_id,
      secondary_id: emotionalStrategy.secondary_id,
      primary_label_th: emotionalStrategy.primary.label_th,
      secondary_label_th: emotionalStrategy.secondary.label_th,
    },
    layers,
    hook: layers.hook || null,
    pain: layers.pain || null,
    solution: layers.solution || null,
    offer: layers.offer || null,
    cta: layers.cta || null,
    full_text_th,
    word_count,
    max_words: typeConfig.max_words,
    within_limit: word_count <= (typeConfig.max_words || 80),
    config_versions: {
      marketing_strategies: getScriptConfigVersion('marketing_strategies'),
      emotional_strategies: getScriptConfigVersion('emotional_strategies'),
      business_strategy_map: getScriptConfigVersion('business_strategy_map'),
      script_types: getScriptConfigVersion('script_types'),
      script_segments: getScriptConfigVersion('script_segments'),
    },
    reproducibility_hash: computeHash(dimensionPayload),
  };
}

export function getScriptEngineInfo() {
  const catalog = getScriptCatalog();
  return {
    engine: ENGINE_ID,
    engine_version: ENGINE_VERSION,
    catalog_version: catalog.version,
    script_types: Object.keys(getScriptConfig('script_types').types),
  };
}

export { ENGINE_ID, ENGINE_VERSION };
