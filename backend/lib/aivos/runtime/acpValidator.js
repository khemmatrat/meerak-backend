import { AIVOS_ACP_SCHEMA_VERSION } from '../config.js';

const REQUIRED_ACP_FIELDS = ['schemaVersion', 'name', 'correlationId', 'timestamp', 'source', 'payload'];

export function validateAcpEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['envelope_required'] };
  }
  const errors = [];
  for (const field of REQUIRED_ACP_FIELDS) {
    if (envelope[field] == null || envelope[field] === '') {
      errors.push(`missing_${field}`);
    }
  }
  if (envelope.schemaVersion !== AIVOS_ACP_SCHEMA_VERSION) {
    errors.push('invalid_schema_version');
  }
  if (envelope.source && typeof envelope.source === 'object') {
    if (!envelope.source.runtimeJobId) errors.push('missing_source_runtimeJobId');
  } else {
    errors.push('invalid_source');
  }
  if (envelope.name && typeof envelope.name === 'string' && !/^[a-z0-9]+(\.[a-z0-9_]+)+$/i.test(envelope.name)) {
    errors.push('invalid_event_name');
  }
  return { valid: errors.length === 0, errors };
}

export function buildAcpEnvelope({
  name,
  correlationId,
  traceId,
  contextId,
  source,
  payload,
}) {
  const envelope = {
    schemaVersion: AIVOS_ACP_SCHEMA_VERSION,
    name,
    correlationId,
    traceId: traceId || null,
    contextId: contextId || null,
    timestamp: new Date().toISOString(),
    source: {
      agentId: source?.agentId || 'runtime',
      skillId: source?.skillId || null,
      runtimeJobId: source?.runtimeJobId || correlationId,
    },
    payload: payload || {},
  };
  const validation = validateAcpEnvelope(envelope);
  if (!validation.valid) {
    const err = new Error(`acp_invalid: ${validation.errors.join(',')}`);
    err.code = 'ACP_INVALID';
    err.details = validation.errors;
    throw err;
  }
  return envelope;
}

export function createAcpValidator() {
  return { validateAcpEnvelope, buildAcpEnvelope };
}
