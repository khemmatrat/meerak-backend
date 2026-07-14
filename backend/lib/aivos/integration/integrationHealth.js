export function createIntegrationHealth({ registry, webhookEngine, oauth } = {}) {
  const heartbeats = new Map();
  const circuits = new Map();

  return {
    heartbeat(connectorId, { tenantId = 'default', status = 'up' } = {}) {
      const key = `${tenantId}::${connectorId}`;
      heartbeats.set(key, { connectorId, tenantId, status, at: new Date().toISOString() });
      return heartbeats.get(key);
    },

    recordFailure(connectorId, { tenantId = 'default', threshold = 3 } = {}) {
      const key = `${tenantId}::${connectorId}`;
      const row = circuits.get(key) || { failures: 0, open: false };
      row.failures += 1;
      if (row.failures >= threshold) row.open = true;
      circuits.set(key, row);
      return row;
    },

    resetCircuit(connectorId, { tenantId = 'default' } = {}) {
      const key = `${tenantId}::${connectorId}`;
      circuits.set(key, { failures: 0, open: false });
      return { connectorId, tenantId, open: false };
    },

    isCircuitOpen(connectorId, { tenantId = 'default' } = {}) {
      return circuits.get(`${tenantId}::${connectorId}`)?.open === true;
    },

    summary({ tenantId } = {}) {
      const connectors = registry?.list?.({ tenantId, enabled: true }) || [];
      const up = connectors.filter((c) => {
        const hb = heartbeats.get(`${c.tenantId}::${c.id}`);
        return !hb || hb.status === 'up';
      }).length;
      return {
        totalConnectors: connectors.length,
        available: up,
        availability: connectors.length ? up / connectors.length : 1,
        webhookQueue: webhookEngine?.queueSize?.() || 0,
        webhookDlq: webhookEngine?.dlqSize?.() || 0,
        oauthTokens: oauth?.listForTenant?.(tenantId)?.length || 0,
        circuitsOpen: [...circuits.values()].filter((c) => c.open).length,
      };
    },
  };
}
