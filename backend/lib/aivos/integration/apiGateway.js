export function createApiGateway({ tenants, oauth, registry, quota, isEnabled = true } = {}) {
  const rateBuckets = new Map();

  return {
    enabled: isEnabled,

    validateRequest({ tenantId, apiKey, jwt, actorTenantId } = {}) {
      if (!isEnabled) return { ok: true, bypass: true };

      if (actorTenantId && tenantId && actorTenantId !== tenantId) {
        const err = new Error('tenant_mismatch');
        err.code = 'TENANT_MISMATCH';
        throw err;
      }

      if (tenants?.enabled && tenantId) {
        tenants.isolation?.assertAccess?.(tenantId, { actorTenantId: tenantId, action: 'execute' });
      }

      if (apiKey && !String(apiKey).startsWith('aivos_')) {
        const err = new Error('api_key_invalid');
        err.code = 'API_KEY_INVALID';
        throw err;
      }

      if (jwt && !String(jwt).includes('.')) {
        const err = new Error('jwt_invalid');
        err.code = 'JWT_INVALID';
        throw err;
      }

      return { ok: true, tenantId, authenticated: !!(apiKey || jwt) };
    },

    checkRateLimit(tenantId, { rpm = 120 } = {}) {
      const now = Date.now();
      const row = rateBuckets.get(tenantId) || { windowStart: now, count: 0 };
      if (now - row.windowStart > 60_000) {
        row.windowStart = now;
        row.count = 0;
      }
      if (row.count >= rpm) {
        const err = new Error('gateway_rate_limit');
        err.code = 'GATEWAY_RATE_LIMIT';
        throw err;
      }
      row.count += 1;
      rateBuckets.set(tenantId, row);
      return { ok: true, remaining: rpm - row.count };
    },

    resolveConnector(connectorId, { tenantId } = {}) {
      const row = registry?.find?.(connectorId, { tenantId });
      if (!row?.enabled) {
        const err = new Error('connector_not_enabled');
        err.code = 'CONNECTOR_NOT_ENABLED';
        throw err;
      }
      return row;
    },
  };
}
