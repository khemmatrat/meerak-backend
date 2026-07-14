/**
 * Sprint 33 — Regional Persona + Tone Engine (Layers 2, 4, 9)
 */

import { PRODUCT_PERSONAS } from './personas/products.js';
import { getRegionalPersona } from './personas/regional.js';
import { createLifecycleEngine } from '../experience/lifecycleEngine.js';

const lifecycleEngine = createLifecycleEngine();

export function isJarvisPersonaEnabled() {
  return process.env.AIVOS_JARVIS_PERSONA === '1';
}

export function isJarvisToneEnabled() {
  return process.env.AIVOS_JARVIS_TONE === '1' || isJarvisPersonaEnabled();
}

function inferProductSurface(input = {}) {
  const { session = {}, feedContext = null, contextJson = {}, surface } = input;
  const mem = contextJson?.jarvis_memory?.long || {};
  const biz = mem.business_context || mem.tags?.business_type;

  if (surface && PRODUCT_PERSONAS[surface]) return surface;
  if (feedContext?.is_food || session.feed_context?.is_food) return 'food';
  if (biz === 'food_merchant' || biz === 'marketplace_seller') return 'merchant';
  if (biz === 'rider') return 'rider';
  if (session.track_order_id || (session.active_orders || []).length > 0) return 'food';
  if (mem.tags?.primary_intent === 'food_order') return 'food';
  if (mem.tags?.primary_intent === 'marketplace_seller') return 'merchant';
  return 'marketplace';
}

function pickOpener(product, regional, locale) {
  const isEn = String(locale || '').toLowerCase().startsWith('en');
  if (isEn) return product.opener_en || regional.greeting;
  if (String(locale).startsWith('id')) return product.opener_en; // TODO id pack sprint 35
  return product.opener_th || regional.greeting;
}

function mergeTone(languageProfile = {}, product = {}, lifecycleTone = '') {
  const emotion = languageProfile.emotion || 'neutral';
  let tone = languageProfile.tone || product.tone || 'warm';
  let formality = languageProfile.formality || 'polite';

  if (isJarvisToneEnabled()) {
    if (emotion === 'stressed' || formality === 'urgent') {
      tone = 'concise';
      formality = 'urgent';
    }
    if (lifecycleTone === 'onboarding_guide') formality = 'polite';
    if (lifecycleTone === 'business_coach') tone = 'professional';
    if (lifecycleTone === 'premium_concierge') tone = 'warm';
  }

  return { tone, formality, emotion, lifecycle_tone: lifecycleTone };
}

/**
 * Resolve full persona context for prompt injection.
 */
export async function resolveJarvisPersona(input = {}) {
  const {
    session = {},
    feedContext = null,
    languageProfile = {},
    contextJson = {},
    surface = null,
    userId = null,
    lifecycleStage = null,
  } = input;

  const country = languageProfile.country || 'TH';
  const locale = languageProfile.detected_lang || languageProfile.locale || 'th-TH';
  const productKey = inferProductSurface({ session, feedContext, contextJson, surface });
  const product = PRODUCT_PERSONAS[productKey] || PRODUCT_PERSONAS.super;
  const regional = getRegionalPersona(country);

  let lifecycleTone = '';
  if (userId || lifecycleStage) {
    const stageRes = await lifecycleEngine.resolveStage({
      userId,
      lifecycleStage,
      isMerchant: productKey === 'merchant' || contextJson?.jarvis_memory?.long?.business_context === 'food_merchant',
    });
    lifecycleTone = lifecycleEngine.getJarvisTone(stageRes.stage);
  }

  const tonePack = mergeTone(languageProfile, product, lifecycleTone);
  const opener = pickOpener(product, regional, locale);

  const styleRules = [
    'Human not AI — no "Certainly! Here are the steps" unless user asks for a list.',
    'Max 3 short sentences on mobile by default.',
    'Use local idioms from regional pack — never machine-translated English phrasing.',
    regional.etiquette,
    product.style,
  ];

  return {
    enabled: isJarvisPersonaEnabled(),
    product: productKey,
    product_name: product.name,
    regional: regional.country,
    locale,
    honorific: regional.honorific,
    greeting: regional.greeting,
    opener,
    payment_phrase: regional.payment_phrase,
    personality: regional.personality,
    festival_hooks: regional.festival_hooks,
    tone: tonePack.tone,
    formality: tonePack.formality,
    emotion: tonePack.emotion,
    lifecycle_tone: tonePack.lifecycle_tone,
    style_rules: styleRules,
    prompt_section: buildPersonaPromptSection({
      product,
      regional,
      tonePack,
      opener,
      styleRules,
      locale,
    }),
  };
}

export function buildPersonaPromptSection({
  product,
  regional,
  tonePack,
  opener,
  styleRules,
  locale,
}) {
  const isEn = String(locale || '').toLowerCase().startsWith('en');
  const lines = isEn
    ? [
        `Persona: ${product.name} (${product.tone}).`,
        `Address user as "${regional.honorific}". Greeting style: ${regional.greeting}`,
        `Tone: ${tonePack.tone}, formality: ${tonePack.formality}, emotion: ${tonePack.emotion}.`,
        `Example opener: "${opener}"`,
        `Payment phrasing: ${regional.payment_phrase}`,
        'Style rules:',
        ...styleRules.map((r) => `- ${r}`),
      ]
    : [
        `บทบาท: ${product.name} (${product.tone})`,
        `เรียกผู้ใช้ว่า "${regional.honorific}" สไตล์ทักทาย: ${regional.greeting}`,
        `น้ำเสียง: ${tonePack.tone} ความสุภาพ: ${tonePack.formality} อารมณ์ผู้ใช้: ${tonePack.emotion}`,
        `ตัวอย่างประโยคเปิด: "${opener}"`,
        `การพูดเรื่องชำระเงิน: ${regional.payment_phrase}`,
        'กฎการสนทนา:',
        ...styleRules.map((r) => `- ${r}`),
      ];
  return lines.join('\n');
}
