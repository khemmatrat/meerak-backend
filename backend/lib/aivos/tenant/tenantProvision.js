export function createTenantProvision({
  lifecycle,
  registry,
  workspace,
  storage,
  quota,
  subscription,
  identity,
  isolation,
  applications,
} = {}) {
  return {
    async provision(manifest, { ownerId, settings = {}, installApps = [] } = {}) {
      const row = await lifecycle.create(manifest, { ownerId, settings });

      for (const appId of installApps) {
        const tpl = applications?.getTemplate?.(appId);
        if (tpl) {
          await applications.provision(tpl, { tenantId: manifest.id, userId: ownerId, config: settings });
          quota.consume(manifest.id, { resource: 'apps', amount: 1 });
        }
      }

      return {
        tenantId: manifest.id,
        provisioned: true,
        tenant: row,
        workspace: workspace.get(manifest.id),
        subscription: subscription.get(manifest.id),
        quotas: quota.get(manifest.id),
      };
    },

    async deprovision(tenantId) {
      isolation.assertAccess(tenantId, { action: 'delete' });
      const apps = applications?.registry?.list?.({ tenantId }) || [];
      for (const app of apps) {
        await applications?.uninstall?.(app.id, { tenantId }).catch(() => {});
      }
      return lifecycle.delete(tenantId);
    },
  };
}
