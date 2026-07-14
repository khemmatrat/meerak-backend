import { isNotificationEnabled } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';

export function pushNotification({ type, priority, payload }) {
  return {
    type,
    priority: Number(priority) || 50,
    payload: payload || {},
    timestamp: Date.now(),
    read: false,
  };
}

export function createNotificationEngine({ storage, metrics, audit, events } = {}) {
  const owner = 'growth.notification';
  const table = 'growth_notifications';

  function queueKey(tenantId, userId) {
    return storage.key(tenantId, userId);
  }

  return {
    list(ctx, { unreadOnly } = {}) {
      const queue = storage.get(table, queueKey(ctx.tenantId, ctx.userId)) || [];
      return unreadOnly ? queue.filter((n) => !n.read) : queue;
    },

    push(ctx, { type, priority, payload } = {}) {
      if (!isNotificationEnabled()) return { ok: false, reason: 'notification_disabled' };
      assertGrowthWriteOwner(owner, table);
      const note = pushNotification({ type, priority, payload });
      const key = queueKey(ctx.tenantId, ctx.userId);
      const queue = storage.get(table, key) || [];
      const row = { ...note, id: `notif-${Date.now()}`, tenantId: ctx.tenantId, userId: ctx.userId };
      storage.put(table, key, [row, ...queue].slice(0, 100));
      metrics?.record?.({ tenantId: ctx.tenantId, action: 'notification.sent', success: true });
      audit?.record?.({ action: 'notification.sent', tenantId: ctx.tenantId, diff: { type } });
      void emitGrowthEvent(events, 'growth.notification.sent', { type, priority }, ctx);
      return { ok: true, notification: row };
    },

    markRead(ctx, notificationId) {
      const key = queueKey(ctx.tenantId, ctx.userId);
      const queue = storage.get(table, key) || [];
      const next = queue.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
      storage.put(table, key, next);
      return { ok: true };
    },

    getPreferences(ctx) {
      const key = `${queueKey(ctx.tenantId, ctx.userId)}::prefs`;
      return storage.get(table, key) || { email: true, push: true, quietHours: null };
    },

    setPreferences(ctx, patch = {}) {
      const key = `${queueKey(ctx.tenantId, ctx.userId)}::prefs`;
      const next = { ...this.getPreferences(ctx), ...patch };
      storage.put(table, key, next);
      return { ok: true, preferences: next };
    },
  };
}
