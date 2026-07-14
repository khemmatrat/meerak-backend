/**
 * Circuit breaker for Social Core ads bridge — feed stays organic when SSOT is down.
 */

const KEY_STATE = 'ads:circuit:state';
const KEY_FAILURES = 'ads:circuit:failures';
const KEY_OPEN_UNTIL = 'ads:circuit:open_until';

const OPEN_SEC = parseInt(process.env.ADS_CIRCUIT_OPEN_SEC || '30', 10);
const FAILURE_THRESHOLD = parseInt(process.env.ADS_CIRCUIT_FAILURE_THRESHOLD || '5', 10);
const WINDOW_SEC = parseInt(process.env.ADS_CIRCUIT_WINDOW_SEC || '60', 10);

/** Paths where we skip bridge calls when circuit is open (delivery / heavy reads). */
const CIRCUIT_PROTECTED_PREFIXES = [
  '/ads/placements/reserve',
  '/ads/admin/reporting',
  '/ads/campaigns?',
];

export function isCircuitProtectedPath(path) {
  const p = String(path || '');
  return CIRCUIT_PROTECTED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export async function getCircuitState(redis) {
  if (!redis) return { state: 'closed', failures: 0, openUntil: null };
  try {
    const state = (await redis.get(KEY_STATE)) || 'closed';
    const openUntil = await redis.get(KEY_OPEN_UNTIL);
    if (state === 'open' && openUntil && Date.now() >= Number(openUntil)) {
      return { state: 'half_open', failures: 0, openUntil: Number(openUntil) };
    }
    const failures = Number((await redis.get(KEY_FAILURES)) || 0);
    return {
      state,
      failures,
      openUntil: openUntil ? Number(openUntil) : null,
    };
  } catch {
    return { state: 'closed', failures: 0, openUntil: null };
  }
}

export async function shouldSkipAdsBridgeCall(redis, path) {
  if (!redis || !isCircuitProtectedPath(path)) return false;
  const { state } = await getCircuitState(redis);
  return state === 'open';
}

export async function recordCircuitSuccess(redis) {
  if (!redis) return;
  try {
    await redis.del(KEY_FAILURES);
    await redis.set(KEY_STATE, 'closed');
    await redis.del(KEY_OPEN_UNTIL);
  } catch {
    /* non-blocking */
  }
}

export async function recordCircuitFailure(redis) {
  if (!redis) return;
  try {
    const n = await redis.incr(KEY_FAILURES);
    if (n === 1) await redis.expire(KEY_FAILURES, WINDOW_SEC);
    if (n >= FAILURE_THRESHOLD) {
      await redis.set(KEY_STATE, 'open');
      await redis.set(KEY_OPEN_UNTIL, String(Date.now() + OPEN_SEC * 1000));
      console.warn(`[ads] circuit OPEN for ${OPEN_SEC}s after ${n} failures`);
    }
  } catch {
    /* non-blocking */
  }
}

export async function getCircuitHealth(redis) {
  const cfg = await getCircuitState(redis);
  return {
    ...cfg,
    openSec: OPEN_SEC,
    failureThreshold: FAILURE_THRESHOLD,
    windowSec: WINDOW_SEC,
  };
}
