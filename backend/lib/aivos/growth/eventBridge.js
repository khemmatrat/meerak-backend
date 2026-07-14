import { emitGrowthEvent } from './growthEmit.js';

const INBOUND_CATALOG = Object.freeze([
  'user.login',
  'user.logout',
  'workflow.completed',
  'publish.completed',
  'purchase.completed',
  'mission.completed',
  'skill.executed',
  'application.installed',
  'tenant.created',
  'marketplace.package.installed',
  'tenant.purged',
  'user.deleted',
  'knowledge.updated',
  'billing.paid',
  'subscription.renewed',
]);

export function createGrowthEventBridge({
  events,
  recommendation,
  mission,
  journey,
  engagementLoop,
  feed,
  notification,
  kpi,
  personalization,
  integration,
  retentionJob,
  handlers = {},
} = {}) {
  const dedup = new Map();
  const outbound = [];

  function emit(type, payload) {
    outbound.push({ type, payload, at: new Date().toISOString() });
    void emitGrowthEvent(events, type, payload, {
      correlationId: payload?.correlationId || `growth-bridge-${Date.now()}`,
    });
    return { type, payload };
  }

  function handle(type, payload = {}) {
    const dedupKey = `${type}::${payload?.id || payload?.correlationId || JSON.stringify(payload)}`;
    if (dedup.has(dedupKey)) return { ok: true, duplicate: true };
    dedup.set(dedupKey, Date.now());

    const fn = handlers[type];
    if (fn) return fn(payload);

    const ctx = {
      tenantId: payload.tenantId || 'default',
      userId: payload.userId || 'u1',
    };

    if (type === 'workflow.completed' && payload?.tenantId) {
      emit('growth.mission.progress', payload);
      if (payload.missionId && engagementLoop) {
        return engagementLoop.onMissionCompleted(ctx, { missionId: payload.missionId });
      }
    }

    if (type === 'mission.completed' && engagementLoop && payload.missionId) {
      return engagementLoop.onMissionCompleted(ctx, { missionId: payload.missionId });
    }

    if (type === 'user.login' && engagementLoop) {
      loopOpen(ctx);
      kpi?.ingest?.(ctx, 'user.login', payload);
      personalization?.learn?.(ctx, { signal: 'login', source: type });
      return engagementLoop.runMorning(ctx);
    }

    if (type === 'application.installed' && integration) {
      return integration.handleEvent(type, payload);
    }

    if (type === 'tenant.created' && integration) {
      return integration.handleEvent(type, payload);
    }

    if (type === 'marketplace.package.installed' && integration) {
      return integration.handleEvent(type, payload);
    }

    if (type === 'tenant.purged' && retentionJob) {
      return retentionJob.onTenantPurged({ tenantId: payload.tenantId || payload.id });
    }

    if (type === 'user.deleted' && retentionJob) {
      return retentionJob.onUserDeleted({
        tenantId: payload.tenantId || 'default',
        userId: payload.userId || payload.id,
      });
    }

    if (type === 'billing.paid' && notification) {
      notification.push(ctx, {
        type: 'billing.paid',
        priority: 60,
        payload: { amount: payload.amount },
      });
    }

    return { ok: true, handled: false, type };
  }

  function loopOpen(ctx) {
    emit('growth.loop.phase.changed', { phase: 'OPEN', ...ctx });
  }

  return {
    catalog: INBOUND_CATALOG,
    inbound: INBOUND_CATALOG,
    subscribe() {
      if (!events?.on) return { ok: false, reason: 'events_unavailable' };
      for (const type of INBOUND_CATALOG) {
        events.on(type, (payload) => handle(type, payload));
      }
      return { ok: true, subscribed: INBOUND_CATALOG.length };
    },
    handle,
    emit,
    outboundLog() {
      return [...outbound];
    },
    dedupSize() {
      return dedup.size;
    },
  };
}
