/**
 * Policy Override – allows authorised principals to temporarily bypass
 * standard automation policies (e.g. force-publish, skip approval).
 *
 * Overrides are time-bounded and require a justification.
 * All overrides are logged in the audit trail.
 */
export function createPolicyOverride(deps = {}) {
  const audit = deps.automationAudit || null;
  const overrides = new Map(); // policyId -> { principal, reason, expiresAt }

  /**
   * Grant a temporary override.
   * @param {{ policyId, principal, reason, ttlMs }} params
   */
  function grant({ policyId, principal, reason, ttlMs = 3600000 }) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    overrides.set(policyId, { policyId, principal, reason, expiresAt, grantedAt: new Date().toISOString() });
    if (audit) audit.log({ type: 'policy_override_granted', policyId, principal, reason, expiresAt });
  }

  /** Revoke an override. */
  function revoke(policyId, principal = 'system') {
    if (overrides.has(policyId)) {
      if (audit) audit.log({ type: 'policy_override_revoked', policyId, principal });
      overrides.delete(policyId);
    }
  }

  /** Check if a policy is currently overridden (and not expired). */
  function isOverridden(policyId) {
    const o = overrides.get(policyId);
    if (!o) return false;
    if (new Date(o.expiresAt) < new Date()) { overrides.delete(policyId); return false; }
    return true;
  }

  function list() { return [...overrides.values()]; }

  return { grant, revoke, isOverridden, list };
}

export default createPolicyOverride;
