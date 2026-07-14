import { hypervisorCheck } from './hypervisor.js';
import { schedulerAdmit } from './scheduler.js';
import { evaluateEnforce } from './policy-engine.js';
import { policyRef } from './policy-catalog.js';
import { checkTenantIsolation } from './identity-hierarchy.js';

function preflightDeny(block, policyKey = 'P_2001') {
  return {
    mode: 'enforce',
    decision: 'deny',
    code: block.code,
    reason: block.reason,
    risk_class: 'L0',
    retry_after_sec: block.retry_after_sec,
    ...policyRef(policyKey),
  };
}
export function runPreflight(input = {}) {
  const aiId = input.agent_id || input.ai_id || input.surface;
  const tenantId = input.tenant_id;

  if (tenantId && input.target_service_id) {
    const iso = checkTenantIsolation({
      caller_tenant_id: tenantId,
      target_service_id: input.target_service_id,
    });
    if (!iso.ok) return preflightDeny(iso, iso.policy_key || 'P_3001');
  }

  const hv = hypervisorCheck(aiId, tenantId);
  if (!hv.ok) return preflightDeny(hv, 'P_2001');

  const sched = schedulerAdmit({
    ai_id: aiId,
    tenant_id: tenantId,
    tokens: input.tokens_estimate || Math.min(4000, String(input.user_message || '').length + 50),
    priority: input.priority || (String(aiId).includes('jarvis') ? 'jarvis' : 'default'),
  });
  if (!sched.admitted) return preflightDeny(sched, 'P_2002');
  return null;
}

/** Phase 3 — hypervisor + scheduler + policy. */
export function evaluateEnforceFull(input = {}) {
  const block = runPreflight(input);
  if (block) return block;
  return evaluateEnforce(input);
}
