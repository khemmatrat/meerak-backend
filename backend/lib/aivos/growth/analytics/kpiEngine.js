import { isKpiEnabled, KPI_IDS } from '../config.js';
import { assertGrowthWriteOwner } from '../domain/ownershipMatrix.js';
import { emitGrowthEvent } from '../growthEmit.js';

const OWNER = 'growth.analytics';
const EVENTS_TABLE = 'growth_kpi_events';
const ROLLUP_TABLE = 'growth_kpi_rollups';

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function createKpiEngine({
  storage,
  metrics,
  journey,
  habit,
  mission,
  revenueEngine,
  events,
} = {}) {
  function tenantPrefix(tenantId) {
    return `${tenantId}::`;
  }

  function recordEvent(tenantId, userId, name, payload = {}) {
    if (!isKpiEnabled()) return;
    const key = storage.key(tenantId, dayKey(), userId, name);
    const row = storage.get(EVENTS_TABLE, key) || { count: 0, users: new Set() };
    const users = row.users instanceof Set ? row.users : new Set(row.users || []);
    users.add(userId);
    storage.put(EVENTS_TABLE, key, {
      tenantId,
      userId,
      name,
      day: dayKey(),
      count: (row.count || 0) + 1,
      users: [...users],
      payload,
      at: storage.now(),
    });
  }

  function distinctUsers(tenantId, days) {
    const users = new Set();
    const prefix = tenantPrefix(tenantId);
    for (const row of storage.list(EVENTS_TABLE, { prefix })) {
      if (!row.day) continue;
      const age = (Date.now() - Date.parse(row.day)) / 86400000;
      if (age <= days) {
        for (const u of row.users || [row.userId]) users.add(u);
      }
    }
    return users.size;
  }

  function rate(tenantId, numEvent, denEvent, days = 7) {
    let num = 0;
    let den = 0;
    const prefix = tenantPrefix(tenantId);
    for (const row of storage.list(EVENTS_TABLE, { prefix })) {
      const age = (Date.now() - Date.parse(row.day || dayKey())) / 86400000;
      if (age > days) continue;
      if (row.name === numEvent) num += row.count || 1;
      if (row.name === denEvent) den += row.count || 1;
    }
    return den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
  }

  return {
    ingest(ctx, eventName, payload = {}) {
      if (!isKpiEnabled()) return;
      recordEvent(ctx.tenantId, ctx.userId, eventName, payload);
    },

    trackFromMetrics(tenantId, action) {
      const map = {
        'feed.impression': 'growth.feed.item.created',
        'mission.complete': 'growth.mission.completed',
        'mission.assigned': 'growth.mission.assigned',
        'nba.presented': 'growth.nba.presented',
        'nba.executed': 'growth.nba.executed',
        'habit.record': 'growth.habit.recorded',
        'journey.advance': 'growth.journey.advanced',
        'journey.fsm': 'growth.journey.advanced',
        'profile.upsert': 'user.login',
      };
      const eventName = map[action];
      if (eventName) recordEvent(tenantId, 'system', eventName, { action });
    },

    getSnapshot(ctx, { window = '7d' } = {}) {
      if (!isKpiEnabled()) return { ok: false, reason: 'kpi_disabled' };

      const days = window === '1d' ? 1 : window === '30d' ? 30 : window === '90d' ? 90 : 7;
      const { tenantId, userId } = ctx;

      const j = journey?.get?.(ctx) || {};
      const habits = habit?.list?.(ctx) || [];
      const missions = mission?.list?.(ctx) || [];
      const completed = missions.filter((m) => m.status === 'completed').length;
      const assigned = missions.length || 1;
      const streak = habits[0]?.streak || 0;
      const jp = j.stageIndex != null
        ? Math.round((j.stageIndex / 4) * 100)
        : Math.round((journeyStateIndex(j.fsmState) / 5) * 100);

      let revenueTotal = 0;
      if (revenueEngine?.enabled) {
        revenueTotal = revenueEngine.aiService?.getDailyTotal?.(userId) ?? 0;
      }

      const mau = distinctUsers(tenantId, 30);
      const kpis = {
        'KPI-DAU': distinctUsers(tenantId, 1),
        'KPI-WAU': distinctUsers(tenantId, 7),
        'KPI-MAU': mau,
        'KPI-RET-D1': rate(tenantId, 'user.login', 'tenant.created', 1),
        'KPI-RET-D7': rate(tenantId, 'user.login', 'tenant.created', 7),
        'KPI-RET-D30': rate(tenantId, 'user.login', 'tenant.created', 30),
        'KPI-MCR': Math.round((completed / assigned) * 1000) / 10,
        'KPI-AVG-SESS': rate(tenantId, 'user.logout', 'user.login', days) || 12,
        'KPI-FCTR': rate(tenantId, 'growth.feed.click', 'growth.feed.item.created', days),
        'KPI-RAR': rate(tenantId, 'growth.recommendation.accepted', 'growth.recommendation.created', days),
        'KPI-AAR': rate(tenantId, 'growth.nba.executed', 'growth.nba.presented', days),
        'KPI-RPU': mau > 0 ? Math.round((revenueTotal / mau) * 100) / 100 : 0,
        'KPI-LTV': revenueTotal,
        'KPI-HS': Math.min(100, Math.round((streak / 30) * 100)),
        'KPI-JP': jp,
      };

      const rollupKey = storage.key(tenantId, window, dayKey());
      storage.put(ROLLUP_TABLE, rollupKey, { tenantId, window, kpis, computedAt: storage.now() });

      void emitGrowthEvent(events, 'growth.analytics.kpi.updated', { window, count: KPI_IDS.length }, ctx);

      return {
        ok: true,
        tenantId,
        window,
        computedAt: new Date().toISOString(),
        kpis,
      };
    },

    catalog: KPI_IDS,
  };
}

function journeyStateIndex(fsmState) {
  const order = ['ONBOARDING', 'DISCOVERY', 'FIRST_SUCCESS', 'GROWING', 'PRO', 'MASTER'];
  const idx = order.indexOf(fsmState);
  return idx >= 0 ? idx : 0;
}
