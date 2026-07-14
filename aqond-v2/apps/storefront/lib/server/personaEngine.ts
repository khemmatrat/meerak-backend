/**
 * Sprint 33 — Persona engine (storefront; sync lifecycle stub)
 */

import { PRODUCT_PERSONAS } from './personas/products';
import { getRegionalPersona, type RegionalPersona } from './personas/regional';

export type JarvisPersonaContext = {
  enabled: boolean;
  product: string;
  product_name: string;
  regional: string;
  locale: string;
  honorific: string;
  greeting: string;
  opener: string;
  tone: string;
  formality: string;
  emotion: string;
  lifecycle_tone: string;
  prompt_section: string;
};

export function isJarvisPersonaEnabled(): boolean {
  return (
    process.env.JARVIS_PERSONA === '1' ||
    process.env.NEXT_PUBLIC_JARVIS_PERSONA === '1'
  );
}

function inferProductSurface(input: {
  session?: Record<string, unknown>;
  feedContext?: { is_food?: boolean } | null;
  contextJson?: Record<string, unknown>;
  surface?: string | null;
}): keyof typeof PRODUCT_PERSONAS {
  const { session = {}, feedContext, contextJson = {}, surface } = input;
  const mem = (contextJson?.jarvis_memory as { long?: { business_context?: string; tags?: Record<string, string> } })?.long;

  if (surface && surface in PRODUCT_PERSONAS) return surface as keyof typeof PRODUCT_PERSONAS;
  if (feedContext?.is_food || (session.feed_context as { is_food?: boolean })?.is_food) return 'food';
  if (mem?.business_context === 'food_merchant' || mem?.business_context === 'marketplace_seller') return 'merchant';
  if (mem?.business_context === 'rider') return 'rider';
  if (session.track_order_id || (session.active_orders as unknown[])?.length) return 'food';
  if (mem?.tags?.primary_intent === 'food_order') return 'food';
  return 'marketplace';
}

function lifecycleToneFor(stage?: string | null): string {
  const tones: Record<string, string> = {
    visitor: 'welcome_explore',
    new_user: 'onboarding_guide',
    merchant: 'business_coach',
    power_user: 'proactive_ops',
  };
  return stage ? tones[stage] || 'helpful_concise' : 'helpful_concise';
}

function pickOpener(
  product: (typeof PRODUCT_PERSONAS)[keyof typeof PRODUCT_PERSONAS],
  regional: RegionalPersona,
  locale: string,
) {
  if (String(locale).toLowerCase().startsWith('en')) return product.opener_en;
  return product.opener_th;
}

function buildPersonaPromptSection(
  product: (typeof PRODUCT_PERSONAS)[keyof typeof PRODUCT_PERSONAS],
  regional: RegionalPersona,
  tone: string,
  formality: string,
  emotion: string,
  opener: string,
  locale: string,
): string {
  const isEn = String(locale).toLowerCase().startsWith('en');
  const styleRules = [
    isEn
      ? 'Human not AI — avoid "Certainly! Here are the steps".'
      : 'ห้ามตอบแบบ AI ทั่วไป — พูดสั้นเป็นธรรมชาติ',
    isEn ? 'Max 3 short sentences on mobile.' : 'ไม่เกิน 3 ประโยคสั้นบนมือถือ',
    regional.etiquette,
    product.style,
  ];
  if (isEn) {
    return [
      `Persona: ${product.name} (${product.tone}).`,
      `Address user as "${regional.honorific}".`,
      `Tone: ${tone}, formality: ${formality}, emotion: ${emotion}.`,
      `Example opener: "${opener}"`,
      ...styleRules.map((r) => `- ${r}`),
    ].join('\n');
  }
  return [
    `บทบาท: ${product.name}`,
    `เรียกผู้ใช้ว่า "${regional.honorific}"`,
    `น้ำเสียง: ${tone} ความสุภาพ: ${formality} อารมณ์: ${emotion}`,
    `ตัวอย่างเปิดบทสนทนา: "${opener}"`,
    ...styleRules.map((r) => `- ${r}`),
  ].join('\n');
}

export function resolveJarvisPersona(input: {
  session?: Record<string, unknown>;
  feedContext?: { is_food?: boolean } | null;
  languageProfile?: Record<string, unknown>;
  contextJson?: Record<string, unknown>;
  surface?: string | null;
  lifecycleStage?: string | null;
}): JarvisPersonaContext {
  const languageProfile = input.languageProfile || {};
  const country = String(languageProfile.country || 'TH');
  const locale = String(languageProfile.detected_lang || languageProfile.locale || 'th-TH');
  const productKey = inferProductSurface(input);
  const product = PRODUCT_PERSONAS[productKey];
  const regional = getRegionalPersona(country);

  let tone = String(languageProfile.tone || product.tone);
  let formality = String(languageProfile.formality || 'polite');
  const emotion = String(languageProfile.emotion || 'neutral');
  const lcTone = lifecycleToneFor(input.lifecycleStage);
  if (lcTone === 'business_coach') tone = 'professional';
  if (emotion === 'stressed' || formality === 'urgent') tone = 'concise';

  const opener = pickOpener(product, regional, locale);
  const prompt_section = buildPersonaPromptSection(
    product,
    regional,
    tone,
    formality,
    emotion,
    opener,
    locale,
  );

  return {
    enabled: isJarvisPersonaEnabled(),
    product: productKey,
    product_name: product.name,
    regional: regional.country,
    locale,
    honorific: regional.honorific,
    greeting: regional.greeting,
    opener,
    tone,
    formality,
    emotion,
    lifecycle_tone: lcTone,
    prompt_section,
  };
}
