import {
  defaultAgentId,
  enforceTimeoutMs,
  guardianApiBase,
  isHypervisorEnabled,
  recordCircuitFailure,
  recordCircuitSuccess,
} from './config.js';

export async function hypervisorKill(input = {}) {
  if (!isHypervisorEnabled()) {
    return { ok: false, code: 'guardian.unavailable', reason: 'agk_hypervisor_off' };
  }
  const base = guardianApiBase();
  if (!base) return { ok: false, code: 'guardian.unavailable' };

  try {
    const res = await fetch(`${base}/guardian/v1/kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      recordCircuitFailure();
      return { ok: false, status: res.status, ...data };
    }
    recordCircuitSuccess();
    return { ok: true, ...data };
  } catch {
    recordCircuitFailure();
    return { ok: false, code: 'guardian.unavailable' };
  }
}

export async function hypervisorReinstate(input = {}) {
  if (!isHypervisorEnabled()) return { ok: false, code: 'guardian.unavailable' };
  const base = guardianApiBase();
  if (!base) return { ok: false, code: 'guardian.unavailable' };

  try {
    const res = await fetch(`${base}/guardian/v1/kill/reinstate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch {
    return { ok: false, code: 'guardian.unavailable' };
  }
}

export async function schedulerAdmitCheck(input = {}) {
  if (!isHypervisorEnabled()) return { admitted: true, degraded: true };
  const base = guardianApiBase();
  if (!base) return { admitted: true, degraded: true };

  const body = {
    ai_id: input.agentId || input.ai_id || defaultAgentId(),
    tenant_id: input.tenantId || input.tenant_id,
    tokens: input.tokens || 50,
    priority: input.priority || 'jarvis',
  };

  try {
    const res = await fetch(`${base}/guardian/v1/scheduler/admit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    return { admitted: data.decision !== 'deny', ...data.data, ...data };
  } catch {
    return { admitted: true, degraded: true };
  }
}
