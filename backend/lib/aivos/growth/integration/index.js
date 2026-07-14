import { createApplicationIntegration } from './applications.js';
import { createTenantIntegration } from './tenants.js';
import { createMarketplaceIntegration } from './marketplace.js';

export function createGrowthIntegrationHub(deps = {}) {
  const applications = createApplicationIntegration(deps);
  const tenants = createTenantIntegration(deps);
  const marketplace = createMarketplaceIntegration(deps);

  return {
    applications,
    tenants,
    marketplace,

    handleEvent(type, payload = {}) {
      if (type === 'application.installed') {
        return applications.onInstalled({
          tenantId: payload.tenantId,
          userId: payload.userId || payload.ownerId || 'u1',
          appId: payload.appId || payload.id,
          appName: payload.name || payload.appName,
        });
      }
      if (type === 'tenant.created') {
        return tenants.onCreated({
          tenantId: payload.tenantId || payload.id,
          ownerId: payload.ownerId || payload.userId,
          plan: payload.plan,
        });
      }
      if (type === 'marketplace.package.installed') {
        return marketplace.onPackageInstalled({
          tenantId: payload.tenantId || 'default',
          userId: payload.userId || 'u1',
          packageId: payload.packageId || payload.package_id,
          packageType: payload.type || payload.packageType,
        });
      }
      return { ok: false, reason: 'event_not_handled', type };
    },
  };
}
