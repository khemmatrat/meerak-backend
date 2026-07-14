'use client';

import { useSearchParams } from 'next/navigation';
import { isExperienceEngineEnabled, isFtxOverlayEnabled } from './flags';
import { isExperienceKillSwitch } from './rollout';

/** Runtime FTX gate: env flags, kill switch, or ?ftx=1 / ?ftx=0 override */
export function useFtxActive(): boolean {
  const params = useSearchParams();
  const q = params.get('ftx');
  if (q === '0') return false;
  if (q === '1') return true;
  if (isExperienceKillSwitch()) return false;
  return isFtxOverlayEnabled() || isExperienceEngineEnabled();
}
