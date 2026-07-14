import {
  defaultAgentId,
  guardianApiBase,
  isCircuitOpen,
  isFirewallShadowEnabled,
  isObserveEnabled,
  isShadowCompareEnabled,
  recordCircuitFailure,
  recordCircuitSuccess,
  resolveCanaryLane,
  resolveGuardianMode,
  sdkTimeoutMs,
  shadowTimeoutMs,
} from './config.js';
import { newCorrelationId, newTraceId } from './ids.js';

/**
 * Phase 1.1+ — start observe tap. Never blocks caller. Fail-open always.
 * Phase 1.2 — includes user_message for shadow firewall when AGK_FIREWALL=shadow.
 */
export function observeStart(ctx = {}) {
  const traceId = ctx.traceId || ctx.trace_id || newTraceId();
  const correlationId =
    ctx.correlationId || ctx.correlation_id || newCorrelationId(ctx.buyerId || ctx.userId);
  const agentId = ctx.agentId || ctx.agent_id || defaultAgentId();
  const mode = resolveGuardianMode();
  const lane = resolveCanaryLane(ctx.buyerId || ctx.userId, traceId);

  if (lane === 'legacy') {
    return { traceId, correlationId, agentId, mode, lane };
  }

  if (!isObserveEnabled() || !guardianApiBase()) {
    return { traceId, correlationId, agentId, mode, lane };
  }

  if (isCircuitOpen()) {
    return { traceId, correlationId, agentId, mode, lane };
  }

  const payload = {
    surface: ctx.surface || 'jarvis',
    route: ctx.route || '/api/ai/jarvis',
    user_id: ctx.userId || ctx.buyerId || null,
    agent_id: agentId,
    tenant_id: ctx.tenantId || ctx.tenant_id || null,
    trace_id: traceId,
    correlation_id: correlationId,
    request_meta: {
      method: ctx.method || 'POST',
      message_length: ctx.messageLength ?? (ctx.userMessage ? String(ctx.userMessage).length : 0),
      flags: ctx.flags || {},
    },
    occurred_at: new Date().toISOString(),
  };

  if (isFirewallShadowEnabled() && ctx.userMessage) {
    payload.user_message = String(ctx.userMessage).slice(0, 4000);
    payload.action = ctx.action || 'none';
  }

  void postGuardian('/guardian/v1/observe', payload, mode).catch(() => {});

  return { traceId, correlationId, agentId, mode, lane };
}

/**
 * Phase 1.1 — complete observe tap (async, fire-and-forget). Fail-open.
 */
export async function observeComplete(ctx = {}) {
  if (!isObserveEnabled() || !guardianApiBase() || isCircuitOpen()) return;
  if (!ctx.traceId && !ctx.trace_id) return;

  const payload = {
    trace_id: ctx.traceId || ctx.trace_id,
    correlation_id: ctx.correlationId || ctx.correlation_id || null,
    agent_id: ctx.agentId || ctx.agent_id || defaultAgentId(),
    response_meta: {
      mode: ctx.mode || 'unknown',
      action: ctx.action || 'none',
      latency_ms: ctx.latencyMs ?? ctx.latency_ms ?? null,
      status: ctx.status ?? 200,
      error: ctx.error || null,
      risk_class: ctx.riskClass ?? null,
    },
    completed_at: new Date().toISOString(),
  };

  await postGuardian('/guardian/v1/observe/complete', payload, resolveGuardianMode()).catch(() => {});
}

/**
 * Phase 1.2 — optional dedicated shadow eval (fire-and-forget). Never blocks.
 */
export function shadowEvaluate(ctx = {}) {
  if (!isFirewallShadowEnabled() || !guardianApiBase() || isCircuitOpen()) return;
  if (!ctx.userMessage && !ctx.user_message) return;

  const payload = {
    trace_id: ctx.traceId || ctx.trace_id || newTraceId(),
    correlation_id: ctx.correlationId || ctx.correlation_id,
    agent_id: ctx.agentId || ctx.agent_id || defaultAgentId(),
    surface: ctx.surface || 'jarvis',
    user_message: String(ctx.userMessage || ctx.user_message).slice(0, 4000),
    action: ctx.action || 'none',
  };

  void postGuardian('/guardian/v1/shadow/evaluate', payload, 'shadow', shadowTimeoutMs()).catch(() => {});
}

async function postGuardian(path, body, mode = 'observe', timeoutMs = sdkTimeoutMs()) {
  const base = guardianApiBase();
  if (!base) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Guardian-Mode': mode },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      recordCircuitFailure();
      return;
    }
    recordCircuitSuccess();
  } catch {
    recordCircuitFailure();
  } finally {
    clearTimeout(timer);
  }
}
