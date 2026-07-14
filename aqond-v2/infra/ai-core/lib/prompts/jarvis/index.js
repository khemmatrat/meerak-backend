/**
 * Sprint 31 — Select native-language Jarvis prompt pack (Layer 5)
 */
import * as thPack from './locales/th.js';
import * as enPack from './locales/en.js';

const PACKS = {
  'th-TH': thPack,
  'th': thPack,
  'en-US': enPack,
  'en-SG': enPack,
  'en-LK': enPack,
  'en': enPack,
};

export function selectJarvisPromptPack(locale) {
  const loc = String(locale || 'th-TH').trim();
  if (PACKS[loc]) return PACKS[loc];
  const prefix = loc.split('-')[0]?.toLowerCase();
  if (prefix === 'en') return enPack;
  return thPack;
}

export function jarvisConciergePromptLocalized(ctx) {
  const profile = ctx.language_profile || ctx.session?.language_profile || {};
  const locale = profile.detected_lang || profile.locale || ctx.jarvis_locale || 'th-TH';
  const useLocalized =
    Boolean(profile.detected_lang) ||
    process.env.AIVOS_JARVIS_LANG_INTEL === '1' ||
    ctx.language_intel_enabled ||
    Boolean(ctx.jarvis_persona?.enabled);
  if (!useLocalized) {
    return null;
  }
  const pack = selectJarvisPromptPack(locale);
  return pack.buildJarvisPrompt(ctx);
}
