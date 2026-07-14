export function emitGrowthEvent(events, name, payload = {}, ctx = {}) {
  if (!events?.emit) return Promise.resolve(null);
  const correlationId = ctx.correlationId || payload.correlationId || `growth-${Date.now()}`;
  return events.emit({
    name,
    correlationId,
    source: { agentId: 'growth', runtimeJobId: correlationId },
    payload: { ...payload },
  }).catch(() => null);
}
