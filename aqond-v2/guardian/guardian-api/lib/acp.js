import crypto from 'crypto';
import { getAgent } from './identity-registry.js';
import { evaluateEnforceFull } from './preflight.js';
import { queryKnowledge } from './knowledge-plane.js';

const ACP_VERSION = '1';
const MAX_INBOX = 10_000;
const inbox = new Map();

/** sender ai_id → receiver ai_id → allowed intents */
const ALLOWLIST = {
  'jarvis-prod-01': {
    'hermes-worker-01': ['notify', 'request.tool', 'query.knowledge'],
    'athena-01': ['query.knowledge', 'notify'],
  },
  'hermes-worker-01': {
    'jarvis-prod-01': ['notify', 'request.tool'],
  },
};

function nowIso() {
  return new Date().toISOString();
}

export function validateAcpEnvelope(body) {
  const errors = [];
  if (body.acp_version !== ACP_VERSION) errors.push('invalid_acp_version');
  if (!body.message_id) errors.push('missing_message_id');
  if (!body.trace_id) errors.push('missing_trace_id');
  if (!body.sender?.ai_id) errors.push('missing_sender_ai_id');
  if (!body.receiver?.ai_id) errors.push('missing_receiver_ai_id');
  if (!body.intent) errors.push('missing_intent');
  if (!body.occurred_at) errors.push('missing_occurred_at');
  const ttl = Number(body.ttl_sec || 30);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 300) errors.push('invalid_ttl_sec');
  return { valid: errors.length === 0, errors, ttl };
}

function isAllowed(senderId, receiverId, intent) {
  const row = ALLOWLIST[senderId];
  if (!row) return false;
  const intents = row[receiverId];
  if (!intents) return false;
  return intents.includes(intent);
}

function storeInbox(receiverId, record) {
  const key = receiverId;
  const list = inbox.get(key) || [];
  list.push(record);
  while (list.length > MAX_INBOX) list.shift();
  inbox.set(key, list);
}

export function getInbox(receiverId, limit = 20) {
  const list = inbox.get(receiverId) || [];
  return list.slice(-limit);
}

/**
 * Phase 2 — Guardian-mediated ACP deliver.
 */
export function deliverAcpMessage(body) {
  const validation = validateAcpEnvelope(body);
  if (!validation.valid) {
    return { ok: false, code: 'guardian.invalid_request', errors: validation.errors };
  }

  const senderId = body.sender.ai_id;
  const receiverId = body.receiver.ai_id;
  const intent = body.intent;

  const sender = getAgent(senderId);
  const receiver = getAgent(receiverId);
  if (!sender) return { ok: false, code: 'guardian.unauthenticated', reason: 'unknown_sender' };
  if (!receiver) return { ok: false, code: 'guardian.not_found', reason: 'unknown_receiver' };
  if (!isAllowed(senderId, receiverId, intent)) {
    return { ok: false, code: 'guardian.denied', reason: 'acp.allowlist_denied' };
  }

  const occurred = new Date(body.occurred_at).getTime();
  if (Number.isNaN(occurred) || Date.now() - occurred > validation.ttl * 1000) {
    return { ok: false, code: 'guardian.denied', reason: 'acp.ttl_expired' };
  }

  const enforce = evaluateEnforceFull({
    user_message: JSON.stringify(body.payload || {}).slice(0, 2000),
    action: intent.includes('tool') ? 'tool' : 'none',
    surface: senderId,
    agent_id: senderId,
    tenant_id: body.scope?.tenant_id,
  });
  if (enforce.decision === 'deny') {
    return {
      ok: false,
      code: enforce.code || 'guardian.denied',
      reason: enforce.reason,
      risk_class: enforce.risk_class,
    };
  }

  let knowledgeResult = null;
  if (intent === 'query.knowledge') {
    knowledgeResult = queryKnowledge({
      query: body.payload?.query || body.payload?.q || '',
      tenant_id: body.scope?.tenant_id,
      locale: body.payload?.locale || 'th',
    });
  }

  const deliveryId = crypto.randomUUID();
  const record = {
    delivery_id: deliveryId,
    message_id: body.message_id,
    trace_id: body.trace_id,
    sender: senderId,
    receiver: receiverId,
    intent,
    payload: body.payload || {},
    knowledge: knowledgeResult,
    delivered_at: nowIso(),
    guardian_signature: `agk:v1:${deliveryId.slice(0, 8)}`,
  };
  storeInbox(receiverId, record);

  return {
    ok: true,
    decision: 'deliver',
    delivery_id: deliveryId,
    trace_id: body.trace_id,
    guardian_signature: record.guardian_signature,
    knowledge: knowledgeResult,
  };
}

export function acpHealth() {
  let messages = 0;
  for (const list of inbox.values()) messages += list.length;
  return { status: 'up', inbox_messages: messages, acp_version: ACP_VERSION };
}
