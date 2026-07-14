export function createTenantIsolation({ registry } = {}) {
  return {
    assertAccess(tenantId, { actorTenantId, action = 'read' } = {}) {
      const row = registry.find(tenantId);
      if (!row) {
        const err = new Error('tenant_not_found');
        err.code = 'TENANT_NOT_FOUND';
        throw err;
      }
      if (row.state === 'deleted') {
        const err = new Error('tenant_deleted');
        err.code = 'TENANT_DELETED';
        throw err;
      }
      if (row.state === 'suspended' && action !== 'read') {
        const err = new Error('tenant_suspended');
        err.code = 'TENANT_SUSPENDED';
        throw err;
      }
      if (actorTenantId && actorTenantId !== tenantId) {
        const err = new Error('tenant_isolation_violation');
        err.code = 'TENANT_ISOLATION_VIOLATION';
        throw err;
      }
      return row;
    },

    assertTenantMatch(requestedTenantId, actorTenantId) {
      if (actorTenantId && actorTenantId !== requestedTenantId) {
        const err = new Error('tenant_mismatch');
        err.code = 'TENANT_MISMATCH';
        err.details = { requestedTenantId, actorTenantId };
        throw err;
      }
    },

    guardResource(requestedTenantId, ownerTenantId, resourceType = 'resource') {
      if (ownerTenantId && ownerTenantId !== requestedTenantId) {
        const err = new Error('tenant_mismatch');
        err.code = 'TENANT_MISMATCH';
        err.details = { resourceType, requestedTenantId, ownerTenantId };
        throw err;
      }
    },

    scopeKey(tenantId, key) {
      return `${tenantId}::${key}`;
    },

    filterByTenant(items, tenantId, field = 'tenantId') {
      return (items || []).filter((item) => item[field] === tenantId);
    },
  };
}
