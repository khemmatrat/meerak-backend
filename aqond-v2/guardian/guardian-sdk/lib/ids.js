import crypto from 'crypto';

/** UUID v4 for trace_id and correlation_id. */
export function newTraceId() {
  return crypto.randomUUID();
}

export function newCorrelationId(seed) {
  if (seed && typeof seed === 'string' && seed.length > 0 && seed !== 'guest') {
    return crypto.createHash('sha256').update(`corr:${seed}:${Date.now()}`).digest('hex').slice(0, 32);
  }
  return crypto.randomUUID();
}
