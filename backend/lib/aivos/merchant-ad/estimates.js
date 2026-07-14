import { isGrokVideoEnabled, grokMaxShots } from './config.js';

/** ประมาณเวลารอ (วินาที) — Grok ~90s/shot, Ken Burns ~4s/shot */
export function estimateJobDurationSec(brief) {
  const shots = brief?.shots?.length || 10;
  const grokShots = isGrokVideoEnabled() ? Math.min(grokMaxShots(), shots) : 0;
  const kbShots = Math.max(0, shots - grokShots);
  return grokShots * 90 + kbShots * 4 + 20;
}

/** UGC single-clip generation — Grok poll + normalize (~2–5 min) */
export function estimateUgcDurationSec(providerId = 'grok') {
  if (providerId === 'grok') return 180;
  return 240;
}
