import crypto from 'crypto';

const MAX_EVENTS = Number(process.env.AGK_AUDIT_MAX_EVENTS || 50_000);
const events = [];
const byTrace = new Map();

function trim() {
  while (events.length > MAX_EVENTS) {
    const old = events.shift();
    if (old?.trace_id) byTrace.delete(old.trace_id);
  }
}

function emitStructured(event) {
  console.log(JSON.stringify({ type: 'agk.audit', ...event }));
}

export function recordObserveStart(body) {
  const auditId = crypto.randomUUID();
  const traceId = body.trace_id || body.traceId;
  const event = {
    audit_id: auditId,
    kind: 'observe.start',
    trace_id: traceId,
    correlation_id: body.correlation_id || body.correlationId,
    agent_id: body.agent_id || body.agentId,
    surface: body.surface,
    route: body.route,
    user_id: body.user_id ?? null,
    tenant_id: body.tenant_id ?? null,
    mission_id: body.mission_id ?? null,
    request_meta: body.request_meta || {},
    occurred_at: body.occurred_at || new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
  events.push(event);
  if (traceId) byTrace.set(traceId, { ...event, complete: null, shadow: null });
  trim();
  emitStructured(event);
  return { audit_id: auditId, trace_id: traceId };
}

export function recordObserveComplete(body) {
  const traceId = body.trace_id || body.traceId;
  const auditId = crypto.randomUUID();
  const event = {
    audit_id: auditId,
    kind: 'observe.complete',
    trace_id: traceId,
    correlation_id: body.correlation_id || body.correlationId,
    agent_id: body.agent_id || body.agentId,
    response_meta: body.response_meta || {},
    completed_at: body.completed_at || new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
  events.push(event);
  const pending = traceId ? byTrace.get(traceId) : null;
  if (pending) pending.complete = event;
  trim();
  emitStructured(event);
  return { audit_id: auditId, trace_id: traceId };
}

export function recordShadowEval(body, shadowResult) {
  const auditId = crypto.randomUUID();
  const traceId = body.trace_id || body.traceId;
  const event = {
    audit_id: auditId,
    kind: 'shadow.eval',
    trace_id: traceId,
    correlation_id: body.correlation_id || body.correlationId,
    agent_id: body.agent_id || body.agentId,
    surface: body.surface,
    shadow: shadowResult?.shadow || shadowResult,
    decision: 'allow',
    recorded_at: new Date().toISOString(),
  };
  events.push(event);
  const pending = traceId ? byTrace.get(traceId) : null;
  if (pending) pending.shadow = event;
  trim();
  emitStructured(event);
  if (shadowResult?.shadow?.would_block || shadowResult?.shadow?.alert_count > 0) {
    emitStructured({
      type: 'agk.alert',
      code: 'guardian.shadow_hit',
      trace_id: traceId,
      would_block: shadowResult.shadow.would_block,
      would_deny: shadowResult.shadow.would_deny,
      risk_class: shadowResult.shadow.risk?.risk_class,
    });
  }
  return { audit_id: auditId, trace_id: traceId };
}

/** Phase 1.3 — enforce decision audit. */
export function recordEnforce(body, enforceResult) {
  const auditId = crypto.randomUUID();
  const traceId = body.trace_id || body.traceId;
  const event = {
    audit_id: auditId,
    kind: 'enforce.decision',
    trace_id: traceId,
    correlation_id: body.correlation_id || body.correlationId,
    agent_id: body.agent_id || body.agentId,
    decision: enforceResult?.decision || 'allow',
    code: enforceResult?.code || null,
    reason: enforceResult?.reason || null,
    risk_class: enforceResult?.risk_class || null,
    policy_id: enforceResult?.policy_id || null,
    mission_id: body.mission_id || null,
    recorded_at: new Date().toISOString(),
  };
  events.push(event);
  trim();
  emitStructured(event);
  if (enforceResult?.decision === 'deny') {
    emitStructured({
      type: 'agk.enforce',
      code: enforceResult.code || 'guardian.denied',
      trace_id: traceId,
      reason: enforceResult.reason,
      risk_class: enforceResult.risk_class,
    });
  }
  return { audit_id: auditId, trace_id: traceId };
}

export function recordAcpDeliver(body, result) {
  const auditId = crypto.randomUUID();
  const event = {
    audit_id: auditId,
    kind: 'acp.deliver',
    trace_id: body.trace_id,
    message_id: body.message_id,
    sender: body.sender?.ai_id,
    receiver: body.receiver?.ai_id,
    intent: body.intent,
    decision: result.decision || (result.ok ? 'deliver' : 'deny'),
    code: result.code || null,
    delivery_id: result.delivery_id || null,
    recorded_at: new Date().toISOString(),
  };
  events.push(event);
  trim();
  emitStructured(event);
  return { audit_id: auditId };
}

export function auditHealth() {
  return { status: 'up', events_buffered: events.length };
}

export function getRecentEvents(limit = 20) {
  return events.slice(-limit);
}
