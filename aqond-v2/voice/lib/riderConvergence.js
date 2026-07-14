/**
 * Sprint 35 — Rider-voice convergence plan (shared locale matrix, separate brain)
 */

import { VOICE_LOCALES } from './locales.js';
import { LATENCY_BUDGETS_MS } from './latency.js';

/** Rider uses TH-first STT; converges on @aqond/voice locale packs */
export const RIDER_VOICE_CONVERGENCE = {
  version: 1,
  jarvis_brain: '/api/ai/jarvis',
  rider_brain: '/api/ai/rider-voice',
  shared_package: '@aqond/voice',
  default_locale: VOICE_LOCALES.TH,
  stt_locale: 'th-TH',
  tts_locale: 'th-TH',
  latency_budget_ms: LATENCY_BUDGETS_MS,
  /** Phase 2: route rider STT through voice-service GPU when VOICE_MODEL=hertz-gpu */
  gpu_path: 'aqond-v2/voice/server.py',
  mobile_handoff: 'docs/aqond-os/products/jarvis/JARVIS_VOICE_MOBILE_HANDOFF.md',
  rules: [
    'Rider keeps job-phase actions in rider-voice route — no merge with shopping tools.',
    'Shared STT/TTS locale matrix from @aqond/voice; persona=rider tuning.',
    'Incidents and dispatch advance stay rider-only.',
    'Jarvis shopping voice uses jarvis_persona + language_profile.',
  ],
};

export function riderVoiceProfile() {
  return {
    product: 'rider',
    stt_locale: RIDER_VOICE_CONVERGENCE.stt_locale,
    tts_locale: RIDER_VOICE_CONVERGENCE.tts_locale,
    brain_route: RIDER_VOICE_CONVERGENCE.rider_brain,
    latency_budget_ms: LATENCY_BUDGETS_MS.total_hands_free,
  };
}
