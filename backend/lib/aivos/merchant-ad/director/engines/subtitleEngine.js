/**
 * Subtitle Engine — extension point (Phase 6).
 */

/**
 * @param {{ script: object|null, video_path: string|null, job: object }} _input
 */
export async function generateSubtitle(_input) {
  return {
    ok: false,
    skipped: true,
    reason: 'subtitle_engine_phase_6',
    subtitle_path: null,
  };
}
