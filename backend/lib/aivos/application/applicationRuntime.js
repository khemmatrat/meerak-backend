import { getWorkflowTemplate } from '../workflow/workflowTemplate.js';

export function createApplicationRuntime({
  registry,
  workflows,
  settings,
  billingEngine,
  revenueEngine,
  metrics,
  store,
  growthEngine,
} = {}) {
  return {
    attach(runtime) {
      if (runtime) runtime._applicationRuntime = this;
      return this;
    },

    async execute(appId, { tenantId = 'default', userId = null, input = {} } = {}) {
      const row = registry.find(appId, { tenantId });
      if (!row?.enabled) {
        const err = new Error('application_not_enabled');
        err.code = 'APPLICATION_NOT_ENABLED';
        throw err;
      }

      const cfg = settings.get(appId, { tenantId }) || {};
      const mergedInput = { ...cfg, ...input };
      const wfId = row.manifest.primaryWorkflow;
      const wfManifest = workflows?.registry?.findWorkflow?.(wfId)?.manifest || getWorkflowTemplate(wfId);
      if (!wfManifest) {
        const err = new Error('application_workflow_not_found');
        err.code = 'APPLICATION_WORKFLOW_NOT_FOUND';
        throw err;
      }

      const pluginId = row.manifest.marketplacePackages?.[0] || appId;
      const started = Date.now();
      let creditCheck = null;

      if (billingEngine?.enabled && userId) {
        creditCheck = await billingEngine.checkCredits({ userId, pluginId });
      }

      const execId = `app-exec-${appId}-${Date.now()}`;
      const result = await workflows.execute({
        manifest: wfManifest,
        input:    mergedInput,
        userId,
      });

      let billing = null;
      if (billingEngine?.enabled && userId) {
        billing = await billingEngine.meterUsage({ jobId: execId, userId, pluginId });
        if (growthEngine?.deductCredits) {
          growthEngine.deductCredits(userId, billing.charged);
        }
      }

      let revenue = null;
      if (revenueEngine?.enabled && userId && revenueEngine.aiService) {
        revenueEngine.aiService.registerService?.({ serviceId: appId, unitPrice: 0.05, billType: 'per_call' });
        revenue = revenueEngine.aiService.recordUsage({ serviceId: appId, customerId: userId, units: 1 });
      }

      const latencyMs = Date.now() - started;
      metrics?.record?.({
        appId,
        tenantId,
        action: 'execute',
        success: result.ok !== false,
        latencyMs,
      });

      return {
        appId,
        tenantId,
        workflowId: wfId,
        executionId: execId,
        creditCheck,
        billing,
        revenue,
        ...result,
      };
    },

    listAttached({ tenantId } = {}) {
      return registry.list({ tenantId, enabled: true });
    },
  };
}
