export function createTenantMigration({
  registry,
  workspace,
  storage,
  identity,
  subscription,
  quota,
  applications,
  audit,
  billingEngine,
  store,
} = {}) {
  function collectTenantBundle(tenantId) {
    const tenant = registry.find(tenantId);
    if (!tenant) throw new Error('tenant_not_found');

    const apps = (applications?.registry?.list?.({ tenantId }) || []).map((a) => ({
      id: a.id,
      manifest: { ...a.manifest },
      enabled: a.enabled,
      settings: applications.settings?.get?.(a.id, { tenantId }) || {},
    }));

    const storageItems = storage.list(tenantId);
    const knowledge = storageItems.filter((i) => i.key.startsWith('knowledge:'));
    const workflows = storageItems.filter((i) => i.key.startsWith('workflow:'));
    const memory = storageItems.filter((i) => i.key.startsWith('memory:'));
    const billing = storageItems.filter((i) => i.key.startsWith('billing:'));

    let billingLedger = [];
    if (store?.kind === 'memory' && store._tables?.costLedger) {
      billingLedger = store._tables.costLedger.filter((r) => r.tenant_id === tenantId);
    }

    return {
      tenant: { ...tenant, manifest: { ...tenant.manifest } },
      workspace: workspace.get(tenantId),
      storage: storageItems,
      knowledge,
      workflows,
      memory,
      billing,
      billingLedger,
      applications: apps,
      identity: identity.listForTenant(tenantId),
      subscription: subscription.get(tenantId),
      quotas: quota.get(tenantId),
      audit: audit.list({ tenantId }),
      exported_at: new Date().toISOString(),
    };
  }

  async function restoreBundle(bundle, { newTenantId, applications: appsEngine } = {}) {
    const targetId = newTenantId || bundle.tenant.id;
    const manifest = { ...bundle.tenant.manifest, id: targetId };
    if (registry.find(targetId)) {
      const err = new Error('tenant_already_exists');
      err.code = 'TENANT_ALREADY_EXISTS';
      throw err;
    }

    registry.register(manifest);
    registry.update(targetId, { state: 'active', plan: bundle.tenant.plan });

    if (bundle.workspace) {
      workspace.create(targetId, {
        name: bundle.workspace.name,
        settings: { ...bundle.workspace.settings },
      });
    }

    for (const item of bundle.storage || []) {
      storage.put(targetId, item.key, item.value);
    }

    for (const binding of bundle.identity || []) {
      identity.bind({ userId: binding.userId, tenantId: targetId, role: binding.role });
    }

    if (bundle.subscription) {
      subscription.bind(targetId, { ...bundle.subscription, tenantId: targetId });
    }

    if (bundle.quotas) {
      quota.init(targetId, bundle.quotas.quotas);
      if (bundle.quotas.usage) {
        const row = quota.get(targetId);
        if (row) row.usage = { ...bundle.quotas.usage };
      }
    } else {
      quota.init(targetId);
    }

    const engine = appsEngine || applications;
    for (const app of bundle.applications || []) {
      if (engine?.install) {
        await engine.install(app.manifest, {
          tenantId: targetId,
          userId: bundle.identity?.find((i) => i.role === 'owner')?.userId,
        });
        if (app.enabled) engine.enable(app.id, { tenantId: targetId });
        if (app.settings && engine.settings) {
          engine.settings.set(app.id, app.settings, { tenantId: targetId });
        }
      } else if (engine?.provision) {
        await engine.provision(app.manifest, {
          tenantId: targetId,
          userId: bundle.identity?.find((i) => i.role === 'owner')?.userId,
          config: app.settings || {},
        });
      }
    }

    for (const entry of bundle.audit || []) {
      audit.record({ action: entry.action, tenantId: targetId, diff: entry.diff });
    }

    if (store?.kind === 'memory' && store._tables?.costLedger && bundle.billingLedger?.length) {
      for (const row of bundle.billingLedger) {
        store._tables.costLedger.push({ ...row, tenant_id: targetId });
      }
    }

    return { tenantId: targetId, restored: true };
  }

  return {
    export(tenantId) {
      return collectTenantBundle(tenantId);
    },

    async import(bundle, opts = {}) {
      return restoreBundle(bundle, opts);
    },

    async migrate(tenantId, { targetTenantId, targetRegion, targetWorkspace } = {}) {
      const bundle = collectTenantBundle(tenantId);
      const targetId = targetTenantId || `${tenantId}-migrated`;
      bundle.tenant.manifest = {
        ...bundle.tenant.manifest,
        id: targetId,
        region: targetRegion || bundle.tenant.manifest.region,
      };
      if (targetWorkspace) {
        bundle.workspace = { ...bundle.workspace, name: targetWorkspace };
      }
      const result = await restoreBundle(bundle, { newTenantId: targetId });
      return { ...result, migrated: true, sourceTenantId: tenantId, targetRegion, targetWorkspace };
    },
  };
}
