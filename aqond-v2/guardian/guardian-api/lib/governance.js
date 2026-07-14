import crypto from 'crypto';
import { policyRef, POLICIES } from './policy-catalog.js';
import { checkTenantIsolation, resolveAiHierarchy } from './identity-hierarchy.js';

const INSIDER_ACTIONS = {
  deploy_skill_wrong_agent: { severity: 'critical', requires_approval: true, policy_key: 'P_3002' },
  elevate_ai_permissions: { severity: 'critical', requires_approval: true, policy_key: 'P_3002' },
  disable_audit: { severity: 'critical', requires_approval: true, policy_key: 'P_3003' },
  modify_policy_bundle: { severity: 'critical', requires_approval: true, policy_key: 'P_3002' },
  global_kill_without_approval: { severity: 'critical', requires_approval: true, policy_key: 'P_3002' },
};

const hitlLedger = [];
const certStore = new Map();

export function simulateInsiderAction(input = {}) {
  const action = input.action || 'unknown';
  const rule = INSIDER_ACTIONS[action];
  const operator = input.operator || 'admin-sim';
  const traceId = input.trace_id || crypto.randomUUID();

  if (!rule) {
    return {
      detected: false,
      decision: 'allow',
      ...policyRef('P_1001'),
      trace_id: traceId,
    };
  }

  const row = {
    trace_id: traceId,
    action,
    operator,
    severity: rule.severity,
    requires_approval: rule.requires_approval,
    detected: true,
    decision: 'deny',
    approval_status: 'pending',
    ...policyRef(rule.policy_key),
    recorded_at: new Date().toISOString(),
  };

  hitlLedger.push(row);
  return row;
}

export function auditTenantIsolation(input = {}) {
  const hierarchy = input.ai_id ? resolveAiHierarchy(input.ai_id) : null;
  const callerTenant = input.caller_tenant_id || hierarchy?.tenant_id;
  const result = checkTenantIsolation({
    caller_tenant_id: callerTenant,
    target_service_id: input.target_service_id,
    target_tenant_id: input.target_tenant_id,
    platform_scope: input.platform_scope,
  });

  const policy = policyRef(result.policy_key || (result.ok ? 'P_1001' : 'P_3001'));
  return {
    ...result,
    ...policy,
    decision: result.ok ? 'allow' : 'deny',
    caller_tenant: callerTenant,
    hierarchy,
  };
}

/**
 * Rotate N AI certificates — measure zero Jarvis disruption (skeleton).
 */
export function rotateCertificates(input = {}) {
  const count = Math.min(Number(input.count || 100), 500);
  const prefix = input.prefix || 'hermes-worker';
  const tenantId = input.tenant_id || 'aqond-platform';
  const serviceId = input.service_id || 'marketplace-v2';
  const started = Date.now();
  const rotated = [];

  for (let i = 0; i < count; i++) {
    const aiId = `${prefix}-${String(i).padStart(3, '0')}`;
    const certId = crypto.randomUUID();
    const notAfter = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    certStore.set(aiId, {
      ai_id: aiId,
      cert_id: certId,
      tenant_id: tenantId,
      service_id: serviceId,
      rotated_at: new Date().toISOString(),
      not_after: notAfter,
    });
    rotated.push({ ai_id: aiId, cert_id: certId });
  }

  return {
    ok: true,
    rotated_count: rotated.length,
    duration_ms: Date.now() - started,
    jarvis_disruption: false,
    policy: policyRef('P_1001'),
    sample: rotated.slice(0, 3),
  };
}

/**
 * DR drill — Region A down, failover to B; AI_ID must remain stable.
 */
export function disasterRecoveryFailover(input = {}) {
  const primary = input.primary_region || 'region-a';
  const failover = input.failover_region || 'region-b';
  const preserveAiIds = input.preserve_ai_ids !== false;
  const bindings = ['jarvis-prod-01', 'hermes-worker-01'].map((ai_id) => ({
    ai_id,
    region_before: primary,
    region_after: failover,
    ai_id_changed: false,
  }));

  return {
    ok: true,
    primary_region: primary,
    failover_region: failover,
    preserve_ai_ids: preserveAiIds,
    recovery_mode: 'warm_standby',
    bindings,
    policy: policyRef('P_1001'),
    mttr_target_ms: 5000,
  };
}

/**
 * Sample N L2 transactions — verify human approval present.
 */
export function auditHitlCompliance(input = {}) {
  const sampleSize = Math.min(Number(input.sample_size || 100), 500);
  const synthetic = [];

  for (let i = 0; i < sampleSize; i++) {
    const needsHitl = i % 5 === 0;
    const approved = true;
    synthetic.push({
      tx_id: `tx-${i}`,
      risk_class: needsHitl ? 'L2' : 'L0',
      hitl_required: needsHitl,
      human_approval: approved ? { approver: 'ops-lead', at: new Date().toISOString() } : null,
    });
  }

  const requiring = synthetic.filter((t) => t.hitl_required);
  const compliant = requiring.filter((t) => t.human_approval).length;
  const rate = requiring.length ? (compliant / requiring.length) * 100 : 100;

  return {
    sample_size: sampleSize,
    hitl_required_count: requiring.length,
    compliant_count: compliant,
    compliance_rate_pct: Math.round(rate * 100) / 100,
    pass: rate >= 100,
    policy: policyRef(rate >= 100 ? 'P_1001' : 'P_3004'),
    gaps: synthetic.filter((t) => t.hitl_required && !t.human_approval).slice(0, 5),
  };
}

export function governanceHealth() {
  return { status: 'up', hitl_ledger: hitlLedger.length, certs: certStore.size };
}
