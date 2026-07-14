export function createConnectorRuntime({
  registry,
  vault,
  oauth,
  workflows,
  applications,
  gateway,
  metrics,
  audit,
  billingEngine,
  revenueEngine,
} = {}) {
  return {
    attach(runtime) {
      if (runtime) runtime._connectorRuntime = this;
      return this;
    },

    async call(connectorId, { tenantId = 'default', method = 'GET', path = '/', body = {}, userId = null, apiKey = null } = {}) {
      gateway?.validateRequest?.({ tenantId, apiKey });
      const row = registry.find(connectorId, { tenantId });
      if (!row?.enabled) {
        const err = new Error('connector_not_enabled');
        err.code = 'CONNECTOR_NOT_ENABLED';
        throw err;
      }
      const cred = vault?.get(connectorId, { tenantId });
      const token = oauth?.getToken(connectorId, { tenantId });
      const started = Date.now();
      const result = {
        ok: true,
        connectorId,
        tenantId,
        provider: row.manifest.provider,
        method,
        path,
        simulated: true,
        response: { status: 200, body: { ...body, provider: row.manifest.provider } },
        latencyMs: Date.now() - started,
        authenticated: !!(cred || token),
      };
      metrics?.record?.({ connectorId, tenantId, action: 'call', success: true, latencyMs: result.latencyMs });
      audit?.record?.({ action: 'call', connectorId, tenantId, diff: { method, path } });
      return result;
    },

    async invoke(connectorId, opts = {}) {
      return this.call(connectorId, opts);
    },

    async execute(connectorId, { tenantId = 'default', userId = null, input = {}, apiKey = null } = {}) {
      gateway?.validateRequest?.({ tenantId, apiKey, actorTenantId: tenantId });
      const row = registry.find(connectorId, { tenantId });
      if (!row?.enabled) {
        const err = new Error('connector_not_enabled');
        err.code = 'CONNECTOR_NOT_ENABLED';
        throw err;
      }

      const started = Date.now();
      let workflowResult = null;
      const wfId = row.manifest.primaryWorkflow;
      if (wfId && workflows?.execute) {
        const wfManifest = workflows.registry?.findWorkflow?.(wfId)?.manifest || workflows.getTemplate?.(wfId);
        if (wfManifest) {
          workflowResult = await workflows.execute({ manifest: wfManifest, input, userId });
        }
      }

      let appResult = null;
      const appId = row.manifest.primaryApplication;
      if (appId && applications?.execute) {
        appResult = await applications.execute(appId, { tenantId, userId, input });
      }

      let billing = null;
      if (billingEngine?.enabled && userId) {
        const jobId = `conn-exec-${connectorId}-${Date.now()}`;
        billing = await billingEngine.meterUsage({
          jobId,
          userId,
          pluginId: connectorId,
          baseCredits: row.manifest.billingMultiplier || 1,
        });
      }

      let revenue = null;
      if (revenueEngine?.enabled && userId) {
        revenueEngine.aiService?.registerService?.({ serviceId: connectorId, unitPrice: 0.05 });
        revenue = revenueEngine.aiService?.recordUsage({ serviceId: connectorId, customerId: userId, units: 1 });
      }

      const latencyMs = Date.now() - started;
      metrics?.record?.({ connectorId, tenantId, action: 'execute', success: true, latencyMs });
      audit?.record?.({ action: 'execute', connectorId, tenantId, diff: { workflowId: wfId, appId } });

      return {
        ok: true,
        connectorId,
        tenantId,
        provider: row.manifest.provider,
        workflowResult,
        appResult,
        billing,
        revenue,
        latencyMs,
        chain: workflowResult?.chain || appResult?.chain || [],
      };
    },
  };
}
