export function createEventBridge({ events, webhookEngine, connectorRuntime, workflows } = {}) {
  return {
    async emitAcpEvent({ name, payload = {}, connectorId, tenantId } = {}) {
      if (events?.emit) {
        await events.emit({
          name,
          correlationId: payload.correlationId || connectorId || 'integration',
          source: { connectorId, tenantId },
          payload,
        }).catch(() => {});
      }
      return { emitted: true, name };
    },

    async routeWebhookToConnector(webhookRow) {
      if (!webhookRow?.connectorId) return { routed: false };
      const result = await connectorRuntime.invoke(webhookRow.connectorId, {
        tenantId: webhookRow.tenantId,
        body: webhookRow.payload,
      });
      return { routed: true, result };
    },

    async routeToWorkflow({ workflowId, input, userId } = {}) {
      const wfManifest = workflows?.getTemplate?.(workflowId) || workflows?.registry?.findWorkflow?.(workflowId)?.manifest;
      if (!wfManifest) return { routed: false, reason: 'workflow_not_found' };
      const result = await workflows.execute({ manifest: wfManifest, input, userId });
      return { routed: true, result };
    },
  };
}
