/** Sprint 30f — Experience Engine rollout gates */

import { isExperienceEngineEnabled, isFtxOverlayEnabled } from './flags';

export const EXPERIENCE_ROLLOUT_VERSION = '30f';

/** Instant rollback — set NEXT_PUBLIC_EXPERIENCE_KILL=1 */
export function isExperienceKillSwitch(): boolean {
  return process.env.NEXT_PUBLIC_EXPERIENCE_KILL === '1';
}

export function isExperienceRolloutLive(): boolean {
  if (isExperienceKillSwitch()) return false;
  return isExperienceEngineEnabled();
}

export function isFtxRolloutLive(): boolean {
  if (isExperienceKillSwitch()) return false;
  return isFtxOverlayEnabled() || isExperienceEngineEnabled();
}
