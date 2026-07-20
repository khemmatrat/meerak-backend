/**
 * Grand Opening — Bangkok (ICT). Single source of truth for landing + mobile.
 * Target: 2026-04-24 01:00 Asia/Bangkok (ISO-8601 with +07:00) — 24 เม.ย. พ.ศ. 2569.
 */
export const GRAND_OPENING_ISO = "2026-04-24T01:00:00+07:00";

const TARGET_MS = Date.parse(GRAND_OPENING_ISO);

/** Milliseconds until opening; 0 after launch (Bangkok instant encoded in ISO). */
export function getRemainingMs(nowMs: number = Date.now()): number {
  return Math.max(0, TARGET_MS - nowMs);
}

export function getCountdownParts(ms: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

/** True once system time is at or past the Bangkok opening instant. */
export function isGrandOpeningLive(nowMs: number = Date.now()): boolean {
  return nowMs >= TARGET_MS;
}
