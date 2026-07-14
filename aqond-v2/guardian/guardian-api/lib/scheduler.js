/**
 * Phase 3 — in-memory resource scheduler (token + request quotas).
 */

const PRIORITY = { sentinel: 4, hermes: 3, jarvis: 2, athena: 1, default: 1 };

const DEFAULT_QUOTAS = {
  'jarvis-prod-01': { req_per_min: 10_000, tokens_per_min: 500_000 },
  'hermes-worker-01': { req_per_min: 5_000, tokens_per_min: 200_000 },
  'athena-01': { req_per_min: 1_000, tokens_per_min: 100_000 },
  default: { req_per_min: 2_000, tokens_per_min: 100_000 },
};

const windows = new Map();

function bucketKey(aiId, tenantId) {
  return `${tenantId || '_'}::${aiId || 'default'}`;
}

function currentWindow() {
  return Math.floor(Date.now() / 60_000);
}

function getBucket(key) {
  const win = currentWindow();
  let b = windows.get(key);
  if (!b || b.window !== win) {
    b = { window: win, requests: 0, tokens: 0 };
    windows.set(key, b);
  }
  return b;
}

function quotaFor(aiId) {
  return DEFAULT_QUOTAS[aiId] || DEFAULT_QUOTAS.default;
}

export function schedulerHealth() {
  return { status: 'up', active_buckets: windows.size };
}

export function schedulerAdmit(input = {}) {
  const aiId = input.ai_id || input.agent_id || 'default';
  const tenantId = input.tenant_id || null;
  const tokens = Number(input.tokens || input.tokens_estimate || 50);
  const priority = PRIORITY[input.priority] || PRIORITY.default;

  const q = quotaFor(aiId);
  const key = bucketKey(aiId, tenantId);
  const bucket = getBucket(key);

  const wouldExceed =
    bucket.requests + 1 > q.req_per_min || bucket.tokens + tokens > q.tokens_per_min;

  if (wouldExceed) {
    return {
      admitted: false,
      code: 'guardian.rate_limited',
      reason: 'scheduler.quota_exceeded',
      retry_after_sec: 60 - (Math.floor(Date.now() / 1000) % 60),
      quota: q,
      usage: { requests: bucket.requests, tokens: bucket.tokens },
      priority,
    };
  }

  bucket.requests += 1;
  bucket.tokens += tokens;
  return {
    admitted: true,
    priority,
    quota: q,
    usage: { requests: bucket.requests, tokens: bucket.tokens },
  };
}

export function getSchedulerQuotas(aiId) {
  const q = quotaFor(aiId);
  const bucket = getBucket(bucketKey(aiId, null));
  return { ai_id: aiId, quota: q, usage: { requests: bucket.requests, tokens: bucket.tokens } };
}
