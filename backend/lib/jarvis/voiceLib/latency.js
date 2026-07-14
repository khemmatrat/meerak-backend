/**
 * Sprint 35 — Latency budget + text fallback (hands-free Jarvis)
 */

export const LATENCY_BUDGETS_MS = {
  stt: 2500,
  jarvis_brain: 8000,
  tts: 3000,
  total_hands_free: 12000,
};

export const VOICE_FALLBACK = 'text';

export function shouldFallbackToText(elapsedMs, stage = 'total') {
  const budget =
    stage === 'stt'
      ? LATENCY_BUDGETS_MS.stt
      : stage === 'tts'
        ? LATENCY_BUDGETS_MS.tts
        : stage === 'brain'
          ? LATENCY_BUDGETS_MS.jarvis_brain
          : LATENCY_BUDGETS_MS.total_hands_free;
  return Number(elapsedMs) > budget;
}

export function voicePathEnabled(env = process.env) {
  return env.AIVOS_JARVIS_VOICE === '1' || env.JARVIS_VOICE === '1';
}
