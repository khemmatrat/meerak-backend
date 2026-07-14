import { createHash } from 'crypto';

export const CONTEXT_SNAPSHOT_VERSION = 'aivos_context_v1';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function computeContextChecksum(snapshot) {
  const input = `${CONTEXT_SNAPSHOT_VERSION}::${stableStringify(snapshot)}`;
  return createHash('sha256').update(input).digest('hex');
}

export function createContextManager({ store }) {
  return {
    async capture({ jobId, intent, metadata = {} }) {
      const snapshot = {
        version: CONTEXT_SNAPSHOT_VERSION,
        job_id: jobId,
        intent,
        metadata,
        captured_at: new Date().toISOString(),
      };
      const checksum = computeContextChecksum(snapshot);
      const row = await store.insertContextSnapshot({
        job_id: jobId,
        snapshot,
        checksum,
      });
      return row;
    },
    async load(contextId) {
      if (!contextId) return null;
      const row = await store.getContextSnapshot(contextId);
      if (!row) return null;
      return {
        id: row.id,
        snapshot: row.snapshot,
        checksum: row.checksum,
      };
    },
  };
}
