import { emitGrowthEvent } from '../growthEmit.js';

export function createApplicationIntegration({ mission, recommendation, profile, audit, events } = {}) {
  return {
    onInstalled({ tenantId, userId, appId, appName }) {
      profile?.upsert?.({ tenantId, userId }, {
        lifecycleStage: 'activation',
        persona: appId?.replace('app-', '').replace('-ai', '') || 'general',
      });

      const assigned = mission?.assign?.({ tenantId, userId }, {
        templateId: `app-${appId}`,
        title: `Launch ${appName || appId}`,
        linkedAppId: appId,
        rewardPoints: 40,
        priority: 85,
      });

      recommendation?.ingress?.('application.catalog', {
        tenantId,
        userId,
        payload: {
          type: 'application.use',
          reason: `Explore ${appName || appId}`,
          source: 'application.catalog',
          action: { type: 'application', targetId: appId },
          priority: 80,
          confidence: 0.85,
        },
      });

      audit?.record?.({ action: 'integration.application', tenantId, diff: { appId, userId } });
      void emitGrowthEvent(events, 'growth.integration.application', { appId }, { tenantId, userId });
      return { ok: true, mission: assigned };
    },
  };
}
