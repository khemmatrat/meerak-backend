/**
 * Sprint 35 — Voice intelligence (storefront server)
 */

import {
  isJarvisVoiceEnabled,
  resolveJarvisVoiceProfile,
} from '@aqond/voice';

export type JarvisVoiceProfile = ReturnType<typeof resolveJarvisVoiceProfile>;

export function isStorefrontJarvisVoiceEnabled(): boolean {
  return (
    process.env.JARVIS_VOICE === '1' ||
    process.env.NEXT_PUBLIC_JARVIS_VOICE === '1' ||
    isJarvisVoiceEnabled()
  );
}

export function resolveStorefrontVoiceProfile(input: {
  languageProfile?: Record<string, unknown>;
  jarvisPersona?: Record<string, unknown>;
  country?: string;
}): JarvisVoiceProfile {
  const profile = resolveJarvisVoiceProfile({
    languageProfile: input.languageProfile,
    jarvisPersona: input.jarvisPersona,
    country: input.country,
  });
  return {
    ...profile,
    enabled: profile.enabled && isStorefrontJarvisVoiceEnabled(),
  };
}
