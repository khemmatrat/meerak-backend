import crypto from 'crypto';
import {
  defaultAgentId,
  enforceTimeoutMs,
  guardianApiBase,
  isCircuitOpen,
  isConfidenceGated,
  isShadowCompareEnabled,
  recordCircuitFailure,
  recordCircuitSuccess,
  resolveCanaryLane,
  shadowTimeoutMs,
} from './config.js';

/**
 * Fetch shadow evaluation result for legacy vs AGK compare (Phase 3.6).
 */
export async function shadowEvaluateForCompare(ctx = {}) {
  const base = guardianApiBase();
  if (!base || isCircuitOpen()) return null;

  const payload = {
    trace_id: ctx.traceId || ctx.trace_id,
    correlation_id: ctx.correlationId || ctx.correlation_id,
    agent_id: ctx.agentId || ctx.agent_id || defaultAgentId(),
    surface: ctx.surface || 'jarvis',
    user_message: String(ctx.userMessage || ctx.user_message || '').slice(0, 4000),
    action: ctx.action || 'none',
  };

  try {
    const res = await fetch(`${base}/guardian/v1/shadow/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Guardian-Mode': 'shadow' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(shadowTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      recordCircuitFailure();
      return null;
    }
    recordCircuitSuccess();
    const shadow = data.data?.shadow || data.shadow || {};
    return {
      would_block: Boolean(shadow.would_block || shadow.firewall?.would_block),
      would_deny: Boolean(shadow.would_deny || shadow.risk?.would_deny),
      risk_class: shadow.risk?.risk_class || 'L0',
      alert_count: shadow.alert_count || 0,
    };
  } catch {
    recordCircuitFailure();
    return null;
  }
}

/** Report legacy vs AGK shadow decision mismatch to confidence plane. */
export async function reportShadowCompare(input = {}) {
  if (!isShadowCompareEnabled()) return;
  const base = guardianApiBase();
  if (!base) return;

  const body = {
    trace_id: input.traceId || input.trace_id,
    lane: input.lane || 'legacy',
    legacy: {
      allowed: input.legacyAllowed !== false,
      status: input.legacyStatus ?? 200,
      mode: input.legacyMode || 'legacy',
      action: input.action || 'none',
    },
    agk: input.agk || {},
  };

  try {
    await fetch(`${base}/guardian/v1/confidence/shadow-compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
  } catch {
    /* fail-open */
  }
}

let confidenceCache = { at: 0, score: null };

export async function fetchConfidenceScore() {
  const base = guardianApiBase();
  if (!base) return null;
  const now = Date.now();
  if (confidenceCache.score != null && now - confidenceCache.at < 60_000) {
    return confidenceCache.score;
  }
  try {
    const res = await fetch(`${base}/guardian/v1/metrics/confidence`, {
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const json = await res.json().catch(() => ({}));
    const score = json?.data?.overall ?? json?.data?.data?.overall;
    if (typeof score === 'number') {
      confidenceCache = { at: now, score };
      return score;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function isHardEnforcementAllowed() {
  if (!isConfidenceGated()) return true;
  const score = await fetchConfidenceScore();
  if (score == null) return false;
  const gate = Number(process.env.AGK_CONFIDENCE_GATE || 99);
  return score >= gate;
}

export { resolveCanaryLane } from './config.js';
