import crypto from 'crypto';
import {
  defaultAgentId,
  enforceTimeoutMs,
  guardianApiBase,
  isAcpEnabled,
  recordCircuitFailure,
  recordCircuitSuccess,
} from './config.js';

/**
 * Phase 2 — send ACP message via Guardian (never direct agent-to-agent HTTP).
 */
export async function acpDeliver(envelope = {}) {
  if (!isAcpEnabled()) {
    return { ok: false, code: 'guardian.unavailable', reason: 'agk_acp_off' };
  }

  const base = guardianApiBase();
  if (!base) return { ok: false, code: 'guardian.unavailable', reason: 'no_api_url' };

  const body = {
    acp_version: '1',
    message_id: envelope.message_id || crypto.randomUUID(),
    trace_id: envelope.trace_id || envelope.traceId || crypto.randomUUID(),
    sender: {
      ai_id: envelope.sender?.ai_id || envelope.senderAiId || defaultAgentId(),
      agent_uuid: envelope.sender?.agent_uuid || null,
    },
    receiver: {
      ai_id: envelope.receiver?.ai_id || envelope.receiverAiId,
      agent_uuid: envelope.receiver?.agent_uuid || null,
    },
    intent: envelope.intent || 'notify',
    scope: envelope.scope || {},
    permission: envelope.permission || [],
    payload: envelope.payload || {},
    risk: envelope.risk || { tier: 'L0' },
    ttl_sec: envelope.ttl_sec ?? 30,
    occurred_at: envelope.occurred_at || new Date().toISOString(),
  };

  if (!body.receiver.ai_id) {
    return { ok: false, code: 'guardian.invalid_request', reason: 'missing_receiver' };
  }

  const timeout = enforceTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${base}/guardian/v1/acp/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Guardian-Mode': 'enforce' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      recordCircuitFailure();
      return { ok: false, status: res.status, ...data };
    }
    recordCircuitSuccess();
    return { ok: true, ...data, data: data.data };
  } catch {
    recordCircuitFailure();
    return { ok: false, code: 'guardian.unavailable', reason: 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}
