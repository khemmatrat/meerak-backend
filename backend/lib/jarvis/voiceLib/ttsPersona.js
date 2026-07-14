/**
 * Sprint 35 — TTS voice tuning per Jarvis product persona
 */

export const TTS_PERSONA_VOICES = {
  merchant: { rate: 1.0, pitch: 0.98, style: 'professional', energy: 'medium' },
  food: { rate: 1.05, pitch: 1.02, style: 'warm', energy: 'high' },
  marketplace: { rate: 1.02, pitch: 1.0, style: 'helpful', energy: 'medium' },
  wallet: { rate: 0.98, pitch: 0.96, style: 'calm', energy: 'low' },
  rider: { rate: 1.08, pitch: 1.0, style: 'brief', energy: 'medium' },
  super: { rate: 1.02, pitch: 1.0, style: 'concierge', energy: 'medium' },
};

export function resolveTtsPersona(productKey = 'super') {
  return TTS_PERSONA_VOICES[productKey] || TTS_PERSONA_VOICES.super;
}
