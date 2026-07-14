export function createIntegrationFlow({
  connectorRuntime,
  workflows,
  automation,
  analyticsEngine,
  revenueEngine,
  audit,
} = {}) {
  return {
    async run({ connectorId, tenantId, userId, input = {} } = {}) {
      const execution = await connectorRuntime.execute(connectorId, { tenantId, userId, input });
      const layers = [
        { id: 'connector', ok: execution.ok === true },
        { id: 'workflow', ok: !!(execution.workflowResult?.ok || execution.appResult?.ok) },
        { id: 'pipeline', ok: execution.chain?.includes('pipeline') },
        { id: 'automation', ok: automation?.enabled === true },
        { id: 'publish', ok: execution.chain?.includes('publish') },
        { id: 'analytics', ok: analyticsEngine?.enabled === true },
        { id: 'revenue', ok: !!execution.revenue || revenueEngine?.enabled === true },
      ];

      audit?.record?.({
        action: 'integration_flow',
        connectorId,
        tenantId,
        diff: { layers: layers.map((l) => l.id) },
      });

      return {
        ok: layers.every((l) => l.ok),
        connectorId,
        tenantId,
        execution,
        layers,
      };
    },
  };
}
