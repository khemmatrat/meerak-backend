import { evaluateShadow } from './shadow.js';
import { policyRef } from './policy-catalog.js';
import { resolveAiHierarchy } from './identity-hierarchy.js';

function deny(code, shadowResult, httpCode = 'guardian.denied', policyKey = 'P_1020') {
  return {
    mode: 'enforce',
    decision: 'deny',
    code: httpCode,
    reason: code,
    risk_class: shadowResult?.shadow?.risk?.risk_class || 'L0',
    shadow: shadowResult?.shadow,
    ...policyRef(policyKey),
  };
}

function allow(shadowResult, policyKey = 'P_1001') {
  return {
    mode: 'enforce',
    decision: 'allow',
    code: null,
    reason: null,
    risk_class: shadowResult?.shadow?.risk?.risk_class || 'L0',
    shadow: shadowResult?.shadow,
    ...policyRef(policyKey),
  };
}

/**
 * Phase 1.3 — policy enforcement with POLICY_ID on every decision.
 */
export function evaluateEnforce(input = {}) {
  const aiId = input.agent_id || input.ai_id;
  const hierarchy = aiId ? resolveAiHierarchy(aiId) : null;
  if (aiId && !hierarchy && process.env.AGK_REQUIRE_HIERARCHY === 'on') {
    return deny('identity.unregistered', { shadow: {} }, 'guardian.denied', 'P_3010');
  }

  const shadowResult = evaluateShadow(input);
  const shadow = shadowResult.shadow || {};
  const riskClass = shadow.risk?.risk_class || 'L0';
  const alerts = shadow.firewall?.alerts || [];
  const critical = alerts.some((a) => a.severity === 'critical');
  const wouldBlock = shadow.firewall?.would_block;

  if (critical) {
    return deny('firewall.critical', shadowResult, 'guardian.denied', 'P_1020');
  }

  if (wouldBlock && (riskClass === 'L1' || riskClass === 'L2')) {
    return deny('firewall.injection', shadowResult, 'guardian.denied', 'P_1021');
  }

  if (riskClass === 'L2') {
    const factors = shadow.risk?.factors || [];
    if (factors.includes('financial_context') || factors.includes('pii_context')) {
      return deny('policy.l2_sensitive', shadowResult, 'guardian.hitl_required', 'P_1023');
    }
    if (factors.includes('admin_context')) {
      return deny('policy.admin_forbidden', shadowResult, 'guardian.denied', 'P_0448');
    }
  }

  const result = allow(shadowResult, 'P_1001');
  if (hierarchy) {
    result.tenant_id = hierarchy.tenant_id;
    result.service_id = hierarchy.service_id;
  }
  return result;
}
