export function createConnectorDependency({
  workflows,
  applications,
  marketplace,
  billingEngine,
  knowledge,
  skills,
  tenants,
} = {}) {
  return {
    async resolve(manifest, { tenantId = 'default', userId = null } = {}) {
      const gaps = [];

      if (manifest.tenantScoped && !tenantId) {
        gaps.push({ kind: 'tenant', reason: 'tenant_required' });
      }

      if (manifest.dependencies?.marketplace?.length && marketplace?.enabled) {
        const installed = await marketplace.listInstalled();
        for (const pkg of manifest.dependencies.marketplace) {
          if (!installed.some((p) => p.package_id === pkg)) {
            gaps.push({ kind: 'marketplace', packageId: pkg });
          }
        }
      }

      if (manifest.dependencies?.workflow && workflows?.registry) {
        if (!workflows.registry.findWorkflow(manifest.dependencies.workflow)) {
          gaps.push({ kind: 'workflow', id: manifest.dependencies.workflow });
        }
      }

      if (manifest.dependencies?.application && applications?.registry) {
        if (!applications.registry.find(manifest.dependencies.application, { tenantId })) {
          gaps.push({ kind: 'application', id: manifest.dependencies.application });
        }
      }

      if (billingEngine?.enabled && userId) {
        try {
          await billingEngine.checkEntitlement?.({ userId, requiredTier: 'standard' });
        } catch (e) {
          gaps.push({ kind: 'billing', reason: e.code || e.message });
        }
      }

      if (tenants?.enabled && tenantId && tenants.registry) {
        const row = tenants.registry.find(tenantId);
        if (!row || row.state === 'deleted') gaps.push({ kind: 'tenant', reason: 'tenant_not_active' });
        if (row?.state === 'suspended') gaps.push({ kind: 'tenant', reason: 'tenant_suspended' });
      }

      return { ok: gaps.length === 0, gaps };
    },
  };
}
