import crypto from 'crypto';
import { getIntent, listIntents } from './intent-catalog.js';
import { policyRef } from './policy-catalog.js';
import { resolveAiHierarchy, checkTenantIsolation } from './identity-hierarchy.js';
import { bindMissionEvent } from './mission-session.js';

/**
 * Authorize human intent — returns scoped capability grant, not raw API access.
 */
export function authorizeIntent(input = {}) {
  const intentId = input.intent_id || input.intent;
  const intent = getIntent(intentId);
  const traceId = input.trace_id || crypto.randomUUID();
  const missionId = input.mission_id || null;

  if (!intent) {
    return {
      decision: 'deny',
      code: 'guardian.intent_unknown',
      ...policyRef('P_3010'),
      trace_id: traceId,
    };
  }

  const aiId = input.ai_id || input.agent_id;
  const hierarchy = aiId ? resolveAiHierarchy(aiId) : null;
  const tenantId = input.tenant_id || hierarchy?.tenant_id;

  if (tenantId && input.target_tenant_id && tenantId !== input.target_tenant_id) {
    const iso = checkTenantIsolation({
      caller_tenant_id: tenantId,
      target_tenant_id: input.target_tenant_id,
    });
    if (!iso.ok) {
      return {
        decision: 'deny',
        code: iso.code,
        reason: iso.reason,
        ...policyRef(iso.policy_key || 'P_3001'),
        trace_id: traceId,
        intent_id: intentId,
      };
    }
  }

  const grant = {
    decision: 'allow',
    intent_id: intent.intent_id,
    intent_name: intent.name,
    risk_class: intent.risk_class,
    hitl_before_pay: intent.hitl_before_pay,
    ...policyRef('P_1001'),
    policy_id: intent.policy_id,
    capabilities: intent.capabilities.map((c) => ({
      ...c,
      granted: true,
      scope: 'intent_bound',
    })),
    ai_id: aiId,
    tenant_id: tenantId,
    service_id: hierarchy?.service_id,
    mission_id: missionId,
    trace_id: traceId,
    granted_at: new Date().toISOString(),
  };

  if (missionId) {
    bindMissionEvent(missionId, {
      kind: 'intent.authorized',
      trace_id: traceId,
      intent_id: intentId,
      ai_id: aiId,
      policy_id: grant.policy_id,
      capability_count: grant.capabilities.length,
    });
  }

  return grant;
}

/**
 * Resolve natural-language hint to intent (rule-based skeleton; LLM router in Phase 4+).
 */
export function resolveIntentFromMessage(message = '') {
  const text = String(message).toLowerCase();
  if (/จัดทริป|plan.*trip|เที่ยว|chiang\s*mai|เชียงใหม่/.test(text)) {
    return 'intent.plan_trip';
  }
  if (/สั่งอาหาร|order.*food|checkout|ชำระ|จ่าย/.test(text)) {
    return 'intent.place_food_order';
  }
  if (/ร้าน|หาอาหาร|restaurant|ญี่ปุ่น|japanese|ใกล้/.test(text)) {
    return 'intent.find_restaurant';
  }
  return null;
}

export function intentHealth() {
  return { status: 'up', catalog_size: listIntents().length };
}
