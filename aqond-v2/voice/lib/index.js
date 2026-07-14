/**
 * Sprint 35 — @aqond/voice public API
 */

import { resolveVoiceLocale } from './locales.js';
import { resolveTtsPersona } from './ttsPersona.js';
import { LATENCY_BUDGETS_MS, VOICE_FALLBACK, voicePathEnabled } from './latency.js';

export { VOICE_LOCALES, resolveVoiceLocale } from './locales.js';
export { TTS_PERSONA_VOICES, resolveTtsPersona } from './ttsPersona.js';
export {
  LATENCY_BUDGETS_MS,
  VOICE_FALLBACK,
  shouldFallbackToText,
  voicePathEnabled,
} from './latency.js';
export { RIDER_VOICE_CONVERGENCE, riderVoiceProfile } from './riderConvergence.js';

export function isJarvisVoiceEnabled(env = process.env) {
  return voicePathEnabled(env);
}

/**
 * Resolve browser + server voice profile for Jarvis hands-free.
 */
export function resolveJarvisVoiceProfile(input = {}) {
  const languageProfile = input.languageProfile || input.language_profile || {};
  const jarvisPersona = input.jarvisPersona || input.jarvis_persona || {};
  const country = languageProfile.country || input.country || 'TH';
  const localePack = resolveVoiceLocale(languageProfile.detected_lang || languageProfile.locale || country);
  const productKey = jarvisPersona.product || input.product || 'super';
  const tts = resolveTtsPersona(productKey);

  return {
    enabled: isJarvisVoiceEnabled(),
    v: 1,
    country: localePack.country,
    stt_locale: localePack.stt,
    tts_locale: localePack.tts,
    voice_hint: localePack.voice_hint,
    bcp47: localePack.bcp47,
    persona_product: productKey,
    tts_rate: tts.rate,
    tts_pitch: tts.pitch,
    tts_style: tts.style,
    latency_budget_ms: LATENCY_BUDGETS_MS,
    fallback: VOICE_FALLBACK,
    hands_free: true,
  };
}
