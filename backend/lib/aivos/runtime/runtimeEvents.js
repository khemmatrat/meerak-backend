import { buildAcpEnvelope } from './acpValidator.js';

export function createRuntimeEvents({ store, publishRedis }) {
  async function emit({ name, correlationId, traceId, contextId, source, payload }) {
    const envelope = buildAcpEnvelope({
      name,
      correlationId,
      traceId,
      contextId,
      source,
      payload,
    });
    const row = await store.insertEvent({
      schema_version: envelope.schemaVersion,
      name: envelope.name,
      correlation_id: envelope.correlationId,
      trace_id: envelope.traceId,
      context_id: envelope.contextId,
      source: envelope.source,
      payload: envelope.payload,
    });
    if (typeof publishRedis === 'function') {
      await publishRedis(envelope).catch(() => {});
    }
    return { envelope, row };
  }

  return {
    emit,
    async listByJob(jobId) {
      return store.listEventsByCorrelation(jobId);
    },
  };
}
