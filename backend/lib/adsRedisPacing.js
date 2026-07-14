/**
 * Redis shadow pacing counters — fast local guard before billable bridge calls.
 */
import { hourlyPacingMultiplier } from './adsPacing.js';

const HOUR_TTL_SEC = 7200;
const DAY_TTL_SEC = 172800;

function hourGrain() {
  return new Date().toISOString().slice(0, 13);
}

function dayGrain() {
  return new Date().toISOString().slice(0, 10);
}

function keys(campaignId) {
  return {
    hour: `ads:pacing:hour:${campaignId}:${hourGrain()}`,
    day: `ads:pacing:day:${campaignId}:${dayGrain()}`,
  };
}

/**
 * @param {import('ioredis').Redis | null} redis
 * @param {{ campaignId: string; dailyImpressionCap?: number|null; hourlyImpressionCap?: number|null }} opts
 */
export async function checkBillablePacingAllowed(redis, opts) {
  if (!redis || !opts?.campaignId) return { allowed: true };

  const k = keys(opts.campaignId);
  const [hourRaw, dayRaw] = await redis.mget(k.hour, k.day);
  const hourCount = Number(hourRaw || 0);
  const dayCount = Number(dayRaw || 0);

  const dailyCap = Number(opts.dailyImpressionCap || 0);
  if (dailyCap > 0 && dayCount >= dailyCap) {
    return { allowed: false, reason: 'daily_impression_cap', dayCount, dailyCap };
  }

  const baseHourly = Number(opts.hourlyImpressionCap || 0);
  if (baseHourly > 0) {
    const mult = hourlyPacingMultiplier();
    const effectiveHourly = Math.max(1, Math.floor(baseHourly * mult));
    if (hourCount >= effectiveHourly) {
      return {
        allowed: false,
        reason: 'hourly_pacing_cap',
        hourCount,
        effectiveHourly,
        multiplier: mult,
      };
    }
  }

  return { allowed: true, hourCount, dayCount };
}

export async function incrementBillablePacing(redis, campaignId) {
  if (!redis || !campaignId) return;
  const k = keys(campaignId);
  const pipe = redis.multi();
  pipe.incr(k.hour);
  pipe.expire(k.hour, HOUR_TTL_SEC);
  pipe.incr(k.day);
  pipe.expire(k.day, DAY_TTL_SEC);
  await pipe.exec();
}

export async function getBillablePacingSnapshot(redis, campaignId) {
  if (!redis || !campaignId) return null;
  const k = keys(campaignId);
  const [hourRaw, dayRaw] = await redis.mget(k.hour, k.day);
  return {
    campaignId,
    hourGrain: hourGrain(),
    dayGrain: dayGrain(),
    hourCount: Number(hourRaw || 0),
    dayCount: Number(dayRaw || 0),
  };
}
