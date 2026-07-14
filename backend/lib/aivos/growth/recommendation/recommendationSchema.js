export const RECOMMENDATION_TYPES = Object.freeze([
  'content.create',
  'content.publish',
  'workflow.run',
  'application.use',
  'mission.start',
  'habit.record',
  'custom',
]);

export const RECOMMENDATION_SOURCES = Object.freeze([
  'growth.brain',
  'growth.personalization',
  'growth.feed',
  'analytics.insights',
  'learning.model',
  'optimization.experiment',
  'workflow.history',
  'revenue.forecast',
]);

export function validateRecommendation(raw = {}) {
  const errors = [];
  const rec = {
    id: String(raw.id || '').trim(),
    type: String(raw.type || '').trim(),
    priority: Number(raw.priority),
    confidence: Number(raw.confidence),
    reason: String(raw.reason || '').trim(),
    source: String(raw.source || '').trim(),
    action: raw.action && typeof raw.action === 'object' ? raw.action : null,
    expiresAt: String(raw.expiresAt || '').trim(),
    tenantId: String(raw.tenantId || '').trim(),
    userId: String(raw.userId || '').trim(),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    createdAt: String(raw.createdAt || '').trim(),
    correlationId: String(raw.correlationId || '').trim(),
  };

  if (!rec.id) errors.push('id_required');
  if (!RECOMMENDATION_TYPES.includes(rec.type) && rec.type !== 'custom') errors.push('type_invalid');
  if (!Number.isFinite(rec.priority) || rec.priority < 0 || rec.priority > 100) errors.push('priority_invalid');
  if (!Number.isFinite(rec.confidence) || rec.confidence < 0 || rec.confidence > 1) errors.push('confidence_invalid');
  if (!rec.reason) errors.push('reason_required');
  if (!rec.source) errors.push('source_required');
  if (!rec.action?.type) errors.push('action_type_required');
  if (!rec.expiresAt) errors.push('expires_at_required');
  if (!rec.tenantId) errors.push('tenant_id_required');
  if (!rec.userId) errors.push('user_id_required');
  if (!rec.createdAt) errors.push('created_at_required');
  if (!rec.correlationId) errors.push('correlation_id_required');

  return errors.length ? { ok: false, errors, recommendation: rec } : { ok: true, recommendation: rec };
}

export function normalizeIngressEvent(event = {}) {
  const payload = event.payload || event;
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  return {
    id: payload.id || `rec-${Date.now()}`,
    type: payload.type || 'custom',
    priority: payload.priority ?? 50,
    confidence: payload.confidence ?? 0.5,
    reason: payload.reason || payload.title || 'Recommendation',
    source: payload.source || event.source || 'external.adapter',
    action: payload.action || { type: 'noop', targetId: null },
    expiresAt: payload.expiresAt || expires,
    tenantId: payload.tenantId || event.tenantId,
    userId: payload.userId || event.userId,
    metadata: payload.metadata || {},
    createdAt: payload.createdAt || new Date().toISOString(),
    correlationId: payload.correlationId || event.id || `corr-${Date.now()}`,
  };
}
