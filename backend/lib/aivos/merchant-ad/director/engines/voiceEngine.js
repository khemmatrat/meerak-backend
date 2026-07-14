/**
 * Voice Engine — extension point (Phase 5).
 */

/**
 * @param {{ script: object|null, style_id: string, job: object }} _input
 */
export async function generateVoice(_input) {
  return {
    ok: false,
    skipped: true,
    reason: 'voice_engine_phase_5',
    audio_path: null,
  };
}
