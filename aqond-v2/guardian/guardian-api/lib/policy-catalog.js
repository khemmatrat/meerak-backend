/**
 * Frozen policy catalog — every AGK decision cites a POLICY_ID (Phase 3.7).
 * Compliance: explain decisions without reading code.
 */
export const POLICIES = {
  P_1001: { id: 'P-1001', name: 'baseline.allow.l0', action: 'allow', phase: '1.3' },
  P_1020: { id: 'P-1020', name: 'firewall.critical.deny', action: 'deny', phase: '1.3' },
  P_1021: { id: 'P-1021', name: 'firewall.injection.deny', action: 'deny', phase: '1.3' },
  P_1023: { id: 'P-1023', name: 'policy.l2_sensitive.hitl', action: 'deny', phase: '1.3' },
  P_0448: { id: 'P-448', name: 'policy.admin_forbidden.deny', action: 'deny', phase: '1.3' },
  P_2001: { id: 'P-2001', name: 'hypervisor.kill.deny', action: 'deny', phase: '3' },
  P_2002: { id: 'P-2002', name: 'scheduler.rate_limit.deny', action: 'deny', phase: '3' },
  P_3001: { id: 'P-3001', name: 'tenant.isolation.deny', action: 'deny', phase: '3.7' },
  P_3002: { id: 'P-3002', name: 'governance.insider.approval_required', action: 'deny', phase: '3.7' },
  P_3003: { id: 'P-3003', name: 'governance.audit_immutable.deny', action: 'deny', phase: '3.7' },
  P_3004: { id: 'P-3004', name: 'governance.hitl.required', action: 'deny', phase: '3.7' },
  P_3010: { id: 'P-3010', name: 'identity.unregistered.deny', action: 'deny', phase: '3.7' },
  P_4001: { id: 'P-4001', name: 'intent.place_food_order', action: 'allow', phase: '3.8' },
  P_4002: { id: 'P-4002', name: 'intent.find_restaurant', action: 'allow', phase: '3.8' },
  P_4003: { id: 'P-4003', name: 'intent.plan_trip', action: 'allow', phase: '3.8' },
};

export function policyRef(key) {
  const p = POLICIES[key];
  return p ? { policy_id: p.id, policy_name: p.name } : { policy_id: 'P-UNKNOWN', policy_name: 'unknown' };
}
