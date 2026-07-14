import { emitGrowthEvent } from '../growthEmit.js';

export function createMarketplaceIntegration({ recommendation, mission, audit, events } = {}) {
  return {
    onPackageInstalled({ tenantId, userId, packageId, packageType }) {
      recommendation?.ingress?.('marketplace.catalog', {
        tenantId,
        userId,
        payload: {
          type: 'workflow.install',
          reason: `Try marketplace package ${packageId}`,
          source: 'marketplace.catalog',
          action: { type: 'workflow', targetId: packageId },
          priority: 70,
          confidence: 0.75,
        },
      });

      if (packageType === 'plugin' || packageType === 'workflow') {
        mission?.assign?.({ tenantId, userId }, {
          templateId: `mp-${packageId}`,
          title: `Run ${packageId} from marketplace`,
          linkedWorkflowId: packageId,
          rewardPoints: 30,
          priority: 75,
        });
      }

      audit?.record?.({ action: 'integration.marketplace', tenantId, diff: { packageId, userId } });
      void emitGrowthEvent(events, 'growth.integration.marketplace', { packageId }, { tenantId, userId });
      return { ok: true, packageId };
    },
  };
}
