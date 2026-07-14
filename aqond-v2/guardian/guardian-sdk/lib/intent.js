import {
  defaultAgentId,
  enforceTimeoutMs,
  guardianApiBase,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
} from './config.js';

export function isMissionEnabled(env = process.env) {
  const v = (env.AGK_MISSION || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

export function isIntentLayerEnabled(env = process.env) {
  const v = (env.AGK_INTENT || 'on').toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

export async function createMissionSession(input = {}) {
  if (!isMissionEnabled()) return null;
  const base = guardianApiBase();
  if (!base || isCircuitOpen()) return null;

  try {
    const res = await fetch(`${base}/guardian/v1/mission/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title || input.userMessage,
        user_id: input.buyerId || input.userId,
        tenant_id: input.tenantId,
        ai_id: input.agentId || defaultAgentId(),
        user_message: input.userMessage,
      }),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      recordCircuitFailure();
      return null;
    }
    recordCircuitSuccess();
    return json?.data?.mission_id || json?.data?.data?.mission_id || null;
  } catch {
    recordCircuitFailure();
    return null;
  }
}

export async function authorizeUserIntent(input = {}) {
  if (!isIntentLayerEnabled()) return null;
  const base = guardianApiBase();
  if (!base || isCircuitOpen()) return null;

  try {
    const res = await fetch(`${base}/guardian/v1/intent/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_message: input.userMessage,
        intent_id: input.intentId,
        ai_id: input.agentId || defaultAgentId(),
        tenant_id: input.tenantId,
        mission_id: input.missionId,
        trace_id: input.traceId,
      }),
      signal: AbortSignal.timeout(enforceTimeoutMs()),
    });
    const json = await res.json().catch(() => ({}));
    return json?.data || null;
  } catch {
    return null;
  }
}
