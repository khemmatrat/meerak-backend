import {
  defaultAgentId,
  enforceTimeoutMs,
  guardianApiBase,
  isCircuitOpen,
  isConfidenceGated,
  isPolicyEnforceEnabled,
  recordCircuitFailure,
  recordCircuitSuccess,
  resolveCanaryLane,
  resolveGuardianMode,
} from './config.js';
import { isHardEnforcementAllowed } from './confidence.js';
import { isL2Plus, quickRiskClass } from './risk-quick.js';

/**
 * Phase 1.3 — synchronous policy enforce. Fail-closed for L2+ when AGK unavailable.
 * @returns {Promise<{ allowed: boolean, decision: string, code?: string, reason?: string, risk_class?: string, degraded?: boolean }>}
 */
export async function enforce(ctx = {}) {
  const lane = resolveCanaryLane(ctx.buyerId || ctx.userId || ctx.user_id, ctx.traceId || ctx.trace_id);
  if (lane === 'legacy') {
    return { allowed: true, decision: 'allow', mode: 'legacy', lane };
  }

  if (!isPolicyEnforceEnabled()) {
    return { allowed: true, decision: 'allow', mode: resolveGuardianMode(), lane };
  }

  if (isConfidenceGated()) {
    const ok = await isHardEnforcementAllowed();
    if (!ok) {
      return { allowed: true, decision: 'allow', mode: 'confidence_degraded', lane, degraded: true };
    }
  }

  const userMessage = ctx.userMessage || ctx.user_message || '';
  const action = ctx.action || 'none';
  const riskClass = quickRiskClass(userMessage, action);

  if (isCircuitOpen()) {
    return failClosedOrDegrade(riskClass, 'guardian.unavailable', 'circuit_open');
  }

  const base = guardianApiBase();
  if (!base) {
    return failClosedOrDegrade(riskClass, 'guardian.unavailable', 'no_api_url');
  }

  const payload = {
    surface: ctx.surface || 'jarvis',
    route: ctx.route || '/api/ai/jarvis',
    user_id: ctx.userId || ctx.buyerId || null,
    agent_id: ctx.agentId || ctx.agent_id || defaultAgentId(),
    tenant_id: ctx.tenantId || ctx.tenant_id || null,
    trace_id: ctx.traceId || ctx.trace_id,
    correlation_id: ctx.correlationId || ctx.correlation_id,
    user_message: String(userMessage).slice(0, 4000),
    action,
  };

  const timeout = enforceTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${base}/guardian/v1/enforce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Guardian-Mode': 'enforce' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      recordCircuitFailure();
      if (data.decision === 'deny') {
        return {
          allowed: false,
          decision: 'deny',
          mode: 'enforce',
          code: data.code || 'guardian.denied',
          reason: data.reason,
          risk_class: data.risk_class || riskClass,
        };
      }
      return failClosedOrDegrade(riskClass, 'guardian.unavailable', 'http_error');
    }

    recordCircuitSuccess();
    if (data.decision === 'deny') {
      return {
        allowed: false,
        decision: 'deny',
        mode: 'enforce',
        code: data.code || 'guardian.denied',
        reason: data.reason,
        risk_class: data.risk_class || riskClass,
      };
    }
    return {
      allowed: true,
      decision: 'allow',
      mode: 'enforce',
      risk_class: data.risk_class || riskClass,
    };
  } catch {
    recordCircuitFailure();
    return failClosedOrDegrade(riskClass, 'guardian.unavailable', 'timeout');
  } finally {
    clearTimeout(timer);
  }
}

function failClosedOrDegrade(riskClass, code, reason) {
  if (isL2Plus(riskClass)) {
    return {
      allowed: false,
      decision: 'deny',
      mode: 'enforce',
      code,
      reason,
      risk_class: riskClass,
      fail_closed: true,
    };
  }
  return { allowed: true, decision: 'allow', mode: 'enforce', degraded: true, reason };
}
