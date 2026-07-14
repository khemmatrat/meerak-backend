/**
 * Feature Gate Engine — experience flags (Sprint 30a stub)
 */

const DEFAULT_FLAGS = {
  experience_engine: () =>
    process.env.AIVOS_EXPERIENCE_ENABLED === '1' && process.env.AIVOS_EXPERIENCE_KILL !== '1',
  ftx_overlay: () =>
    process.env.AIVOS_EXPERIENCE_FTX === '1' && process.env.AIVOS_EXPERIENCE_KILL !== '1',
  jarvis_proactive: () => process.env.AIVOS_JARVIS_PROACTIVE === '1',
  guided_tour: () => process.env.AIVOS_EXPERIENCE_TOUR === '1',
  experience_kill: () => process.env.AIVOS_EXPERIENCE_KILL === '1',
};

export function createFeatureGateEngine(_deps = {}) {
  return {
    isEnabled(flag) {
      const fn = DEFAULT_FLAGS[flag];
      return fn ? fn() : false;
    },

    getAll() {
      return Object.fromEntries(
        Object.entries(DEFAULT_FLAGS).map(([k, fn]) => [k, fn()]),
      );
    },
  };
}
