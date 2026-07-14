import express from 'express';
import { recordObserveComplete, recordObserveStart, recordShadowEval, recordEnforce, recordAcpDeliver, auditHealth } from './lib/audit.js';
import {
  getAgent,
  listAgents,
  registerAgent,
  registryHealth,
} from './lib/identity-registry.js';
import { evaluateShadow } from './lib/shadow.js';
import { evaluateEnforce } from './lib/policy-engine.js';
import { evaluateEnforceFull } from './lib/preflight.js';
import { computeSoakMetrics } from './lib/soak-metrics.js';
import { computeRuntimeMetrics } from './lib/runtime-metrics.js';
import { computeConfidenceScore, recordShadowCompare } from './lib/confidence.js';
import { computeReliability, recordFailure, recordRecovery } from './lib/reliability.js';
import { blackboxRecord, blackboxDump, blackboxHealth, installBlackboxHooks } from './lib/blackbox.js';
import {
  simulateInsiderAction,
  auditTenantIsolation,
  rotateCertificates,
  disasterRecoveryFailover,
  auditHitlCompliance,
  governanceHealth,
} from './lib/governance.js';
import {
  resolveAiHierarchy,
  registerService,
  checkTenantIsolation,
  hierarchyHealth,
} from './lib/identity-hierarchy.js';
import { POLICIES } from './lib/policy-catalog.js';
import { authorizeIntent, resolveIntentFromMessage, intentHealth } from './lib/intent-engine.js';
import { listIntents } from './lib/intent-catalog.js';
import { createMission, getMissionTimeline, missionHealth } from './lib/mission-session.js';
import { deliverAcpMessage, getInbox, acpHealth } from './lib/acp.js';
import { queryKnowledge } from './lib/knowledge-plane.js';
import {
  applyKill,
  reinstateKill,
  getHypervisorStatus,
  hypervisorHealth,
} from './lib/hypervisor.js';
import { getSchedulerQuotas, schedulerAdmit, schedulerHealth } from './lib/scheduler.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
installBlackboxHooks();

const PORT = Number(process.env.PORT || 8200);
const MODE = (process.env.AGK_MODE || 'observe').toLowerCase();
const FIREWALL_MODE = (process.env.AGK_FIREWALL || 'off').toLowerCase();
const POLICY_MODE = (process.env.AGK_POLICY || 'off').toLowerCase();
const ACP_MODE = (process.env.AGK_ACP || 'on').toLowerCase();
const KNOWLEDGE_MODE = (process.env.AGK_KNOWLEDGE || 'on').toLowerCase();
const HYPERVISOR_MODE = (process.env.AGK_HYPERVISOR || 'on').toLowerCase();
const CONTRACT_VERSION = 1;

function isFirewallShadow() {
  return FIREWALL_MODE === 'shadow' || FIREWALL_MODE === 'on' || FIREWALL_MODE === '1';
}

function isPolicyEnforce() {
  return POLICY_MODE === 'on' || POLICY_MODE === 'enforce' || POLICY_MODE === '1' || POLICY_MODE === 'true';
}

function isHypervisorOn() {
  return HYPERVISOR_MODE !== 'off' && HYPERVISOR_MODE !== '0' && HYPERVISOR_MODE !== 'false';
}

function effectiveMode() {
  if (isPolicyEnforce()) return 'enforce';
  if (isFirewallShadow()) return 'shadow';
  return MODE;
}

function envelope(extra = {}) {
  return {
    ok: true,
    guardian_contract_version: CONTRACT_VERSION,
    mode: MODE,
    decision: 'allow',
    ...extra,
  };
}

function latencyMs(start) {
  return Date.now() - start;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'guardian-api',
    status: 'healthy',
    mode: MODE,
    dependencies: {
      audit: auditHealth().status,
      identity_registry: registryHealth().status,
      policy: isPolicyEnforce() ? 'enforce' : 'off',
    },
  });
});

app.get('/guardian/v1/health', (_req, res) => {
  res.json(envelope({
    status: 'healthy',
    dependencies: { audit: 'up', identity_registry: 'up', firewall: isFirewallShadow() ? 'shadow' : 'off', policy: isPolicyEnforce() ? 'enforce' : 'off', acp: acpHealth().status, knowledge: KNOWLEDGE_MODE === 'off' ? 'off' : 'up', hypervisor: isHypervisorOn() ? hypervisorHealth().status : 'off', scheduler: isHypervisorOn() ? schedulerHealth().status : 'off', blackbox: blackboxHealth().status, confidence: 'up', governance: governanceHealth().status, hierarchy: hierarchyHealth().status, intent: intentHealth().status, mission: missionHealth().status },
    latency_ms: 0,
  }));
});

/** Phase 1.2 — shadow evaluate. Always decision: allow. */
app.post('/guardian/v1/shadow/evaluate', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const shadowResult = evaluateShadow(body);
  recordShadowEval(body, shadowResult);

  res.json(
    envelope({
      trace_id: body.trace_id,
      correlation_id: body.correlation_id,
      latency_ms: latencyMs(started),
      decision: 'allow',
      mode: 'shadow',
      data: shadowResult,
    }),
  );
});

/** Phase 1.3 — enforce. May return deny for L1+/L2+ per policy. */
app.post('/guardian/v1/enforce', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const result = isHypervisorOn() ? evaluateEnforceFull(body) : evaluateEnforce(body);
  recordEnforce(body, result);
  blackboxRecord('enforce.decision', {
    trace_id: body.trace_id,
    agent_id: body.agent_id,
    decision: result.decision,
    code: result.code,
    risk_class: result.risk_class,
    envelope: { user_message_len: String(body.user_message || '').length, action: body.action },
  });

  if (result.decision === 'deny') {
    const status =
      result.code === 'guardian.rate_limited'
        ? 429
        : result.code === 'guardian.unavailable'
          ? 503
          : 403;
    return res.status(status).json({
      ok: false,
      guardian_contract_version: CONTRACT_VERSION,
      trace_id: body.trace_id,
      correlation_id: body.correlation_id,
      mode: 'enforce',
      decision: 'deny',
      code: result.code || 'guardian.denied',
      reason: result.reason,
      risk_class: result.risk_class,
      policy_id: result.policy_id || null,
      policy_name: result.policy_name || null,
      tenant_id: result.tenant_id || body.tenant_id || null,
      service_id: result.service_id || null,
      latency_ms: latencyMs(started),
    });
  }

  res.json(
    envelope({
      trace_id: body.trace_id,
      correlation_id: body.correlation_id,
      latency_ms: latencyMs(started),
      mode: 'enforce',
      decision: 'allow',
      risk_class: result.risk_class,
      policy_id: result.policy_id || 'P-1001',
      policy_name: result.policy_name || null,
      tenant_id: result.tenant_id || body.tenant_id || null,
      service_id: result.service_id || null,
      data: { shadow: result.shadow },
    }),
  );
});

/** POST /guardian/v1/observe — never blocks upstream caller */
app.post('/guardian/v1/observe', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const traceId = body.trace_id || req.headers['x-trace-id'];
  const correlationId = body.correlation_id || req.headers['x-correlation-id'];

  const recorded = recordObserveStart({
    ...body,
    trace_id: traceId,
    correlation_id: correlationId,
  });

  let shadowData = null;
  if (isFirewallShadow() && body.user_message) {
    const shadowResult = evaluateShadow({
      ...body,
      trace_id: traceId,
      correlation_id: correlationId,
    });
    recordShadowEval(body, shadowResult);
    shadowData = shadowResult.shadow;
  }

  res.json(
    envelope({
      trace_id: recorded.trace_id,
      correlation_id: correlationId || body.correlation_id,
      latency_ms: latencyMs(started),
      mode: isFirewallShadow() ? 'shadow' : MODE,
      data: {
        recorded: true,
        audit_id: recorded.audit_id,
        shadow: shadowData,
      },
    }),
  );
});

app.post('/guardian/v1/observe/complete', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const recorded = recordObserveComplete(body);

  res.json(
    envelope({
      trace_id: recorded.trace_id,
      correlation_id: body.correlation_id,
      latency_ms: latencyMs(started),
      data: { recorded: true, audit_id: recorded.audit_id },
    }),
  );
});

app.get('/guardian/v1/identity/:ai_id', (req, res) => {
  const started = Date.now();
  const agent = getAgent(req.params.ai_id);
  if (!agent) {
    return res.status(404).json({
      ok: false,
      guardian_contract_version: CONTRACT_VERSION,
      code: 'guardian.not_found',
      latency_ms: latencyMs(started),
    });
  }
  res.json(envelope({ latency_ms: latencyMs(started), data: { agent } }));
});

app.get('/guardian/v1/identity', (_req, res) => {
  const started = Date.now();
  res.json(envelope({ latency_ms: latencyMs(started), data: { agents: listAgents() } }));
});

/** Skeleton — audit trail only; no cert issuance in 1.1 */
app.post('/guardian/v1/identity/register', (req, res) => {
  const started = Date.now();
  const result = registerAgent(req.body || {});
  if (!result.ok) {
    return res.status(400).json({
      ok: false,
      guardian_contract_version: CONTRACT_VERSION,
      code: 'guardian.invalid_request',
      message: result.error,
      latency_ms: latencyMs(started),
    });
  }
  res.json(
    envelope({
      latency_ms: latencyMs(started),
      data: { agent: result.agent, created: result.created },
    }),
  );
});

/** Phase 2 — ACP deliver (Guardian-mediated inter-agent bus). */
app.post('/guardian/v1/acp/deliver', (req, res) => {
  const started = Date.now();
  if (ACP_MODE === 'off' || ACP_MODE === '0' || ACP_MODE === 'false') {
    return res.status(503).json({
      ok: false,
      code: 'guardian.unavailable',
      message: 'AGK_ACP disabled',
      latency_ms: latencyMs(started),
    });
  }
  const body = req.body || {};
  const result = deliverAcpMessage(body);
  recordAcpDeliver(body, result);

  if (!result.ok) {
    const status = result.code === 'guardian.unauthenticated' ? 401 : result.code === 'guardian.not_found' ? 404 : 403;
    return res.status(status).json({
      ok: false,
      guardian_contract_version: CONTRACT_VERSION,
      mode: 'enforce',
      trace_id: body.trace_id,
      ...result,
      latency_ms: latencyMs(started),
    });
  }

  res.json(
    envelope({
      trace_id: body.trace_id,
      latency_ms: latencyMs(started),
      mode: effectiveMode(),
      decision: 'deliver',
      data: result,
    }),
  );
});

/** Phase 2 — Knowledge Plane read (curated FAQ; no raw DB). */
app.get('/guardian/v1/knowledge/query', (req, res) => {
  const started = Date.now();
  if (KNOWLEDGE_MODE === 'off' || KNOWLEDGE_MODE === '0') {
    return res.status(503).json({ ok: false, code: 'guardian.unavailable' });
  }
  const data = queryKnowledge({
    query: req.query.q || req.query.query || '',
    tenant_id: req.query.tenant_id,
    locale: req.query.locale || 'th',
  });
  res.json(envelope({ latency_ms: latencyMs(started), data }));
});

app.get('/guardian/v1/acp/inbox/:ai_id', (req, res) => {
  const started = Date.now();
  const messages = getInbox(req.params.ai_id, Number(req.query.limit || 20));
  res.json(envelope({ latency_ms: latencyMs(started), data: { ai_id: req.params.ai_id, messages } }));
});

/** Phase 3 — hypervisor kill / reinstate */
app.post('/guardian/v1/kill', (req, res) => {
  const started = Date.now();
  if (!isHypervisorOn()) {
    return res.status(503).json({ ok: false, code: 'guardian.unavailable', message: 'AGK_HYPERVISOR off' });
  }
  const result = applyKill(req.body || {});
  if (!result.ok) {
    return res.status(400).json({ ok: false, code: 'guardian.invalid_request', message: result.error });
  }
  res.json(envelope({ latency_ms: latencyMs(started), decision: 'kill', data: result }));
});

app.post('/guardian/v1/kill/reinstate', (req, res) => {
  const started = Date.now();
  if (!isHypervisorOn()) {
    return res.status(503).json({ ok: false, code: 'guardian.unavailable' });
  }
  const result = reinstateKill(req.body || {});
  res.json(envelope({ latency_ms: latencyMs(started), decision: 'reinstate', data: result }));
});

app.get('/guardian/v1/hypervisor/status', (_req, res) => {
  const started = Date.now();
  res.json(envelope({ latency_ms: latencyMs(started), data: getHypervisorStatus() }));
});

app.get('/guardian/v1/scheduler/quotas/:ai_id', (req, res) => {
  const started = Date.now();
  res.json(envelope({ latency_ms: latencyMs(started), data: getSchedulerQuotas(req.params.ai_id) }));
});

app.post('/guardian/v1/scheduler/admit', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const sched = schedulerAdmit(body);
  res.json(
    envelope({
      latency_ms: latencyMs(started),
      decision: sched.admitted ? 'allow' : 'deny',
      data: sched,
    }),
  );
});

/** Soak / sign-off metrics (in-memory audit buffer). */
app.get('/guardian/v1/metrics/soak', (_req, res) => {
  res.json(envelope({ data: computeSoakMetrics(), latency_ms: 0 }));
});

/** Kernel readiness — heap / CPU / active handles (Phase 3.5 memleak soak). */
app.get('/guardian/v1/metrics/runtime', (_req, res) => {
  res.json(envelope({ data: computeRuntimeMetrics(), latency_ms: 0 }));
});

/** Phase 3.6 — Guardian Confidence Score + MTTR/MTBF. */
app.get('/guardian/v1/metrics/confidence', (_req, res) => {
  res.json(envelope({ data: computeConfidenceScore(), latency_ms: 0 }));
});

app.get('/guardian/v1/metrics/reliability', (_req, res) => {
  res.json(envelope({ data: computeReliability(), latency_ms: 0 }));
});

/** Phase 3.6 — shadow compare (legacy vs AGK decision). */
app.post('/guardian/v1/confidence/shadow-compare', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  const row = recordShadowCompare(body);
  blackboxRecord('shadow.compare', {
    trace_id: body.trace_id,
    lane: body.lane,
    mismatch: row.mismatch,
    legacy: body.legacy,
    agk: body.agk,
  });
  if (row.mismatch) {
    recordFailure('shadow_mismatch', { trace_id: body.trace_id });
    console.log(JSON.stringify({ type: 'agk.confidence.mismatch', ...row }));
  }
  res.json(envelope({ data: row, latency_ms: latencyMs(started) }));
});

/** Phase 3.6 — reliability events (chaos / recovery probes). */
app.post('/guardian/v1/reliability/failure', (req, res) => {
  const row = recordFailure(req.body?.type || 'unknown', req.body?.meta || {});
  blackboxRecord('reliability.failure', row);
  res.json(envelope({ data: row, latency_ms: 0 }));
});

app.post('/guardian/v1/reliability/recovery', (req, res) => {
  const row = recordRecovery(req.body?.type || null, req.body?.meta || {});
  if (row) blackboxRecord('reliability.recovery', row);
  res.json(envelope({ data: row, latency_ms: 0 }));
});

/** Black Box Recorder — last 5 minutes before crash. */
app.get('/guardian/v1/blackbox/dump', (_req, res) => {
  res.json(envelope({ data: blackboxDump(), latency_ms: 0 }));
});

/** Phase 3.7 — Governance Validation */
app.get('/guardian/v1/policies', (_req, res) => {
  res.json(envelope({ data: Object.values(POLICIES), latency_ms: 0 }));
});

app.get('/guardian/v1/identity/resolve/:ai_id', (req, res) => {
  const h = resolveAiHierarchy(req.params.ai_id);
  if (!h) return res.status(404).json(envelope({ code: 'guardian.not_found', latency_ms: 0 }));
  res.json(envelope({ data: h, latency_ms: 0 }));
});

app.post('/guardian/v1/services/register', (req, res) => {
  const started = Date.now();
  const result = registerService(req.body || {});
  res.status(result.ok ? 200 : 400).json(envelope({ data: result, latency_ms: latencyMs(started) }));
});

app.post('/guardian/v1/governance/tenant-check', (req, res) => {
  const started = Date.now();
  const result = auditTenantIsolation(req.body || {});
  res.json(envelope({ data: result, decision: result.decision, latency_ms: latencyMs(started) }));
});

app.post('/guardian/v1/governance/insider-sim', (req, res) => {
  const started = Date.now();
  const result = simulateInsiderAction(req.body || {});
  res.json(envelope({ data: result, decision: result.decision || 'deny', latency_ms: latencyMs(started) }));
});

app.post('/guardian/v1/governance/cert-rotate', (req, res) => {
  const started = Date.now();
  const result = rotateCertificates(req.body || {});
  res.json(envelope({ data: result, latency_ms: latencyMs(started) }));
});

app.post('/guardian/v1/governance/dr-failover', (req, res) => {
  const started = Date.now();
  const result = disasterRecoveryFailover(req.body || {});
  res.json(envelope({ data: result, latency_ms: latencyMs(started) }));
});

app.get('/guardian/v1/governance/hitl-audit', (req, res) => {
  const started = Date.now();
  const result = auditHitlCompliance({ sample_size: Number(req.query.sample_size || 100) });
  res.json(envelope({ data: result, pass: result.pass, latency_ms: latencyMs(started) }));
});

/** Phase 3.8 — Intent Layer + Mission Session */
app.get('/guardian/v1/intents', (_req, res) => {
  res.json(envelope({ data: listIntents(), latency_ms: 0 }));
});

app.post('/guardian/v1/intent/authorize', (req, res) => {
  const started = Date.now();
  const body = req.body || {};
  if (!body.intent_id && body.user_message) {
    body.intent_id = resolveIntentFromMessage(body.user_message);
  }
  const result = authorizeIntent(body);
  const status = result.decision === 'deny' ? 403 : 200;
  blackboxRecord('intent.authorize', { trace_id: body.trace_id, intent_id: body.intent_id, decision: result.decision });
  res.status(status).json(envelope({ data: result, decision: result.decision, latency_ms: latencyMs(started) }));
});

app.post('/guardian/v1/mission/create', (req, res) => {
  const started = Date.now();
  const mission = createMission(req.body || {});
  res.json(envelope({ data: mission, latency_ms: latencyMs(started) }));
});

app.get('/guardian/v1/mission/:mission_id/timeline', (req, res) => {
  const timeline = getMissionTimeline(req.params.mission_id);
  if (!timeline) return res.status(404).json(envelope({ code: 'guardian.not_found', latency_ms: 0 }));
  res.json(envelope({ data: timeline, latency_ms: 0 }));
});

app.listen(PORT, () => {
  console.log(`[guardian-api] listening on :${PORT} mode=${effectiveMode()} policy=${POLICY_MODE} acp=${ACP_MODE} hypervisor=${HYPERVISOR_MODE}`);
});
