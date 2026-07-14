/** Sprint 30a — Experience Engine feature flags (client-safe) */

export function isExperienceEngineEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EXPERIENCE_ENGINE === '1';
}

export function isFtxOverlayEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_EXPERIENCE_FTX === '1' ||
    process.env.NEXT_PUBLIC_FTX === '1'
  );
}

export function isJarvisProactiveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JARVIS_PROACTIVE === '1';
}
