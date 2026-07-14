import { isGovernanceEnabled } from './config.js';
import { createVersionPin, createVersionSnapshot } from './versioning.js';
import { createReproduceEngine } from './reproduceEngine.js';

function disabledStub({ store }) {
  return {
    enabled: false,
    auditVersionChange: async (row) => store.appendGovernanceAudit(row),
    reproduce:          async (jobId) => ({ jobId, stub: true }),
    diff:               async () => ({ match: true, stub: true }),
    pinVersion:         async () => ({ ok: false, reason: 'governance_disabled' }),
    saveSnapshot:       async () => ({ ok: false, reason: 'governance_disabled' }),
    listAudit:          async () => [],
    auditMarketplace:   async () => null,
  };
}

export function createGovernanceEngine({ store, events } = {}) {
  if (!isGovernanceEnabled()) {
    return disabledStub({ store });
  }

  const versionPin      = createVersionPin({ store });
  const versionSnapshot = createVersionSnapshot({ store });
  const reproduceEngine = createReproduceEngine({ store });

  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: payload.job_id || payload.entity_id || 'governance',
        source:        { runtimeJobId: payload.job_id || null },
        payload,
      }).catch(() => {});
    }
  }

  return {
    enabled: true,

    async auditVersionChange({
      entityType, entityId, entityVersion, action, actorId, diff, jobId, traceId,
    } = {}) {
      const row = await store.appendGovernanceAudit({
        entity_type:    entityType,
        entity_id:      entityId,
        entity_version: entityVersion,
        action,
        actor_id:       actorId,
        diff:           diff || {},
        job_id:         jobId,
        trace_id:       traceId,
      });
      await emit('aivos.governance.versioned', { entityType, entityId, entityVersion, action, jobId });
      return row;
    },

    async auditMarketplace({ packageId, type, version, action, actorId, diff } = {}) {
      const pin = versionPin.pin({
        entityType: type || 'plugin',
        entityId:   packageId,
        version,
        actorId,
        payload:    diff || {},
      });
      versionSnapshot.save({
        entityType: type || 'plugin',
        entityId:   packageId,
        version,
        blob:       { packageId, type, version, action, diff },
        actorId,
      });
      const row = await store.appendGovernanceAudit({
        entity_type:    `marketplace_${type || 'plugin'}`,
        entity_id:      packageId,
        entity_version: version,
        action,
        actor_id:       actorId,
        diff:           diff || {},
      });
      if (action === 'rollback') {
        await emit('aivos.governance.rollback', { packageId, type, version });
      } else {
        await emit('aivos.governance.versioned', { packageId, type, version, action });
      }
      return { audit: row, pin };
    },

    reproduce: (jobId) => reproduceEngine.reproduce(jobId),
    diff:      (jobId, baseline) => reproduceEngine.diff(jobId, baseline),

    pinVersion:  (opts) => versionPin.pin(opts),
    getPin:      (opts) => versionPin.get(opts),
    listPins:    (opts) => versionPin.list(opts),
    saveSnapshot: (opts) => versionSnapshot.save(opts),
    listSnapshots: (opts) => versionSnapshot.list(opts),

    listAudit({ jobId, entityType, entityId } = {}) {
      if (store.kind !== 'memory') return [];
      return store._tables.governanceAudit.filter((r) => {
        if (jobId && r.job_id !== jobId) return false;
        if (entityType && r.entity_type !== entityType) return false;
        if (entityId && r.entity_id !== entityId) return false;
        return true;
      });
    },
  };
}

export { isGovernanceEnabled } from './config.js';
