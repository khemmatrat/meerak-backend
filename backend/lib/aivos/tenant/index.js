import { isTenantEnabled, TENANT_PHASE } from './config.js';
import { createTenantRegistry } from './tenantRegistry.js';
import { validateManifest, normalizeManifest, MANIFEST_FIELDS } from './tenantManifest.js';
import { createTenantIsolation } from './tenantIsolation.js';
import { createTenantIdentity } from './tenantIdentity.js';
import { createTenantWorkspace } from './tenantWorkspace.js';
import { createTenantStorage } from './tenantStorage.js';
import { createTenantQuota } from './tenantQuota.js';
import { createTenantSubscription } from './tenantSubscription.js';
import { createTenantLifecycle } from './tenantLifecycle.js';
import { createTenantProvision } from './tenantProvision.js';
import { createTenantMigration } from './tenantMigration.js';
import { createTenantBackup } from './tenantBackup.js';
import { createTenantMetrics } from './tenantMetrics.js';
import { createTenantAudit } from './tenantAudit.js';

function disabledStub() {
  return {
    enabled: false,
    phase: TENANT_PHASE,
    registry: { list: () => [], find: () => null },
    create: async () => ({ ok: false }),
    provision: async () => ({ ok: false }),
  };
}

export function createTenantEngine({
  runtime,
  store,
  applications,
  billingEngine,
  governance,
  revenueEngine,
} = {}) {
  if (!isTenantEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const resolvedApps = applications || runtime?.applications;
  const registry = createTenantRegistry({ store: resolvedStore });
  const isolation = createTenantIsolation({ registry });
  const identity = createTenantIdentity({ store: resolvedStore });
  const workspace = createTenantWorkspace({ store: resolvedStore });
  const storage = createTenantStorage({ store: resolvedStore, isolation });
  const quota = createTenantQuota({ store: resolvedStore });
  const subscription = createTenantSubscription({
    store: resolvedStore,
    billingEngine: billingEngine || runtime?.billingEngine,
  });
  const metrics = createTenantMetrics();
  const audit = createTenantAudit({ governance: governance || runtime?.governance });
  const lifecycle = createTenantLifecycle({
    registry,
    workspace,
    storage,
    quota,
    subscription,
    identity,
    isolation,
    audit,
  });
  const migration = createTenantMigration({
    registry,
    workspace,
    storage,
    identity,
    subscription,
    quota,
    applications: resolvedApps,
    audit,
    billingEngine: billingEngine || runtime?.billingEngine,
    store: resolvedStore,
  });
  const backup = createTenantBackup({ store: resolvedStore, migration });
  const provision = createTenantProvision({
    lifecycle,
    registry,
    workspace,
    storage,
    quota,
    subscription,
    identity,
    isolation,
    applications: resolvedApps,
  });

  async function executeApp(appId, { tenantId, userId, actorTenantId, input = {} } = {}) {
    const actor = actorTenantId || identity.resolveTenant(userId);
    isolation.assertTenantMatch(tenantId, actor);
    isolation.assertAccess(tenantId, { actorTenantId: tenantId, action: 'execute' });

    const appRow = resolvedApps?.registry?.find?.(appId, { tenantId });
    if (!appRow?.enabled) {
      if (actor && actor !== tenantId) {
        const err = new Error('tenant_mismatch');
        err.code = 'TENANT_MISMATCH';
        err.details = { appId, tenantId, actorTenantId: actor };
        throw err;
      }
      const err = new Error('application_not_enabled');
      err.code = 'APPLICATION_NOT_ENABLED';
      throw err;
    }

    quota.checkRateLimit(tenantId);
    quota.consume(tenantId, { resource: 'executions_day', amount: 1 });
    await subscription.verifyEntitlement(tenantId, { userId });

    const started = Date.now();
    const result = await resolvedApps.execute(appId, { tenantId, userId, input });
    const latencyMs = Date.now() - started;

    if (result.billing) {
      storage.put(tenantId, `billing:${result.billing.jobId}`, result.billing);
    }

    metrics.record({ tenantId, action: 'execute', success: result.ok !== false, latencyMs });
    audit.record({ action: 'execute', tenantId, diff: { appId, workflowId: result.workflowId } });
    return result;
  }

  async function runSaaSFlow({ tenantId, appId, userId, input = {} } = {}) {
    const execution = await executeApp(appId, { tenantId, userId, input });
    const quotasAfter = quota.get(tenantId);
    const auditTrail = audit.list({ tenantId });

    const layers = [
      { id: 'workspace', ok: !!workspace.get(tenantId) },
      { id: 'application', ok: !!resolvedApps?.registry?.find?.(appId, { tenantId }) },
      { id: 'workflow', ok: execution.ok === true },
      { id: 'pipeline', ok: execution.chain?.includes('pipeline') },
      { id: 'render', ok: execution.chain?.includes('render') },
      { id: 'publish', ok: execution.chain?.includes('publish') },
      { id: 'orchestrator', ok: execution.chain?.includes('orchestrator') },
      { id: 'analytics', ok: runtime?.analyticsEngine?.enabled === true },
      { id: 'learning', ok: runtime?.learningEngine?.enabled === true },
      { id: 'optimization', ok: runtime?.optimizationEngine?.enabled === true },
      { id: 'automation', ok: runtime?.automationEngine?.enabled === true },
      { id: 'revenue', ok: !!execution.revenue || runtime?.revenueEngine?.enabled === true },
      { id: 'billing', ok: !!execution.billing },
      { id: 'quota', ok: !!quotasAfter },
      { id: 'audit', ok: auditTrail.length >= 1 },
    ];

    if (runtime?.revenueEngine?.enabled && execution.revenue) {
      runtime.revenueEngine.aiService?.registerService?.({ serviceId: appId, unitPrice: 0.05 });
    }

    if (runtime?.analyticsEngine?.enabled) {
      storage.put(tenantId, 'memory:saas:last_run', {
        appId,
        executionId: execution.executionId,
        at: new Date().toISOString(),
      });
    }

    audit.record({ action: 'saas_flow', tenantId, diff: { appId, layers: layers.map((l) => l.id) } });
    metrics.record({ tenantId, action: 'saas_flow', success: true, latencyMs: 0 });

    return {
      ok: layers.every((l) => l.ok),
      tenantId,
      appId,
      execution,
      quotas: quotasAfter,
      billing: execution.billing,
      revenue: execution.revenue,
      audit: auditTrail,
      layers,
    };
  }

  const engine = {
    enabled: true,
    phase: TENANT_PHASE,
    registry,
    isolation,
    identity,
    workspace,
    storage,
    quota,
    subscription,
    lifecycle,
    provision,
    migration,
    backup,
    metrics,
    audit,

    validate: (raw) => validateManifest(raw),
    create: (manifest, opts) => lifecycle.create(manifest, opts),
    suspend: (tenantId) => lifecycle.suspend(tenantId),
    restore: (tenantId) => lifecycle.restore(tenantId),
    delete: (tenantId) => lifecycle.delete(tenantId),
    purge: async (tenantId) => {
      const apps = resolvedApps?.registry?.list?.({ tenantId }) || [];
      for (const app of apps) {
        await resolvedApps?.uninstall?.(app.id, { tenantId }).catch(() => {});
      }
      return lifecycle.purge(tenantId);
    },
    provision: (manifest, opts) => provision.provision(manifest, opts),
    deprovision: (tenantId) => provision.deprovision(tenantId),
    executeApp,
    runSaaSFlow,
    getMetrics: (opts) => metrics.getStats(opts),
  };

  if (runtime) runtime.tenants = engine;
  return engine;
}

export {
  isTenantEnabled,
  TENANT_PHASE,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  createTenantRegistry,
  createTenantIsolation,
  createTenantWorkspace,
};
