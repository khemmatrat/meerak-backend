import { isExperienceEngineEnabled, isFtxOverlayEnabled } from './flags';
import { isExperienceKillSwitch } from './rollout';

/** Default post-handoff path when Experience Engine rollout is live */
export function experienceHandoffNext(fallback = '/m/home'): string {
  if (isExperienceKillSwitch()) return fallback;
  if (!isExperienceEngineEnabled() && !isFtxOverlayEnabled()) return fallback;
  if (fallback.includes('ftx=')) return fallback;
  const base = fallback.startsWith('/') ? fallback : '/m/home';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}ftx=1`;
}
