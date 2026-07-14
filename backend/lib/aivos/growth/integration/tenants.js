import { emitGrowthEvent } from '../growthEmit.js';

export function createTenantIntegration({ profile, mission, kpi, personalization, audit, events } = {}) {
  return {
    onCreated({ tenantId, ownerId, plan }) {
      const ctx = { tenantId, userId: ownerId || 'owner' };
      profile?.upsert?.(ctx, {
        lifecycleStage: 'onboarding',
        displayName: 'Founder',
        engagementScore: 5,
        preferences: { plan: plan || 'standard' },
      });
      personalization?.learn?.(ctx, { vertical: 'general', signal: 'tenant.created' });
      kpi?.ingest?.(ctx, 'tenant.created', { plan });
      mission?.assign?.(ctx, {
        templateId: 'onboarding-welcome',
        title: 'Complete your onboarding mission',
        rewardPoints: 25,
        priority: 90,
      });
      audit?.record?.({ action: 'integration.tenant', tenantId, diff: { ownerId } });
      void emitGrowthEvent(events, 'growth.integration.tenant', { plan }, ctx);
      return { ok: true, profile: profile?.get?.(ctx) };
    },
  };
}
