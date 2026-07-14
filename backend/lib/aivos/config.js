/**
 * AQOND AI-OS Runtime configuration and feature flags.
 * All public entry points must respect AIVOS_RUNTIME_ENABLED.
 */

export const AIVOS_RUNTIME_ENABLED =
  process.env.AIVOS_RUNTIME_ENABLED === '1' ||
  process.env.AIVOS_RUNTIME_ENABLED === 'true';

export function isResumePluginEnabled() {
  return (
    process.env.AIVOS_RESUME_PLUGIN_ENABLED === '1' ||
    process.env.AIVOS_RESUME_PLUGIN_ENABLED === 'true'
  );
}

export const AIVOS_COMPILER_VERSION = '1.0.0';

export const AIVOS_ACP_SCHEMA_VERSION = '3.0';

export const AIVOS_RUNTIME_QUEUE_NAME = 'aivos-runtime-jobs';

export function assertRuntimeEnabled() {
  if (!AIVOS_RUNTIME_ENABLED) {
    const err = new Error('aivos_runtime_disabled');
    err.code = 'AIVOS_RUNTIME_DISABLED';
    throw err;
  }
}
