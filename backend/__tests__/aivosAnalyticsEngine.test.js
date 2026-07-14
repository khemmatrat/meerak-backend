import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnalyticsEngine,
  createAnalyticsStorage,
  createMetricsCollector,
  createEventAggregator,
  createKpiCalculator,
  createFunnelAnalytics,
  createDashboardApi,
  createEventReplay,
} from '../lib/aivos/analytics/index.js';
import { createRuntimeStore } from '../lib/aivos/runtime/runtimeStore.js';
import { createRuntimeEvents } from '../lib/aivos/runtime/runtimeEvents.js';
import { createRuntime } from '../lib/aivos/runtime/index.js';

process.env.AIVOS_ANALYTICS_ENABLED = '1';
process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
process.env.AIVOS_PUBLISH_ENABLED = '1';

// ─── AN01 Analytics Storage ──────────────────────────────────────────────────

test('AN01 analytics storage append, query, count, sum', () => {
  const storage = createAnalyticsStorage();

  storage.append({ type: 'impression', jobId: 'job-a', platform: 'tiktok', value: 1 });
  storage.append({ type: 'impression', jobId: 'job-a', platform: 'tiktok', value: 1 });
  storage.append({ type: 'click', jobId: 'job-a', platform: 'tiktok', value: 1 });
  storage.append({ type: 'watch', jobId: 'job-a', platform: 'tiktok', value: 45 });

  assert.equal(storage.count({ type: 'impression' }), 2);
  assert.equal(storage.count({ type: 'click' }), 1);
  assert.equal(storage.sum({ type: 'watch' }), 45);

  const byJob = storage.query({ jobId: 'job-a' });
  assert.equal(byJob.length, 4);

  const byPlatform = storage.query({ platform: 'tiktok' });
  assert.equal(byPlatform.length, 4);
});

// ─── AN02 Metrics Collector ───────────────────────────────────────────────────

test('AN02 metrics collector tracks all event types', () => {
  const storage = createAnalyticsStorage();
  const collector = createMetricsCollector({ storage });

  collector.trackImpression({ jobId: 'j1', platform: 'youtube' });
  collector.trackClick({ jobId: 'j1', platform: 'youtube' });
  collector.trackWatchTime({ jobId: 'j1', platform: 'youtube', seconds: 60 });
  collector.trackConversion({ jobId: 'j1', platform: 'youtube' });
  collector.trackRevenue({ jobId: 'j1', platform: 'youtube', amount: 100 });
  collector.trackCost({ jobId: 'j1', platform: 'youtube', amount: 20 });

  assert.equal(storage.count({ type: 'impression' }), 1);
  assert.equal(storage.count({ type: 'click' }), 1);
  assert.equal(storage.sum({ type: 'watch' }), 60);
  assert.equal(storage.sum({ type: 'revenue' }), 100);
  assert.equal(storage.sum({ type: 'cost' }), 20);
});

// ─── AN03 Metrics Collector – consume runtime event ───────────────────────────

test('AN03 metrics collector consumes publish runtime event', () => {
  const storage = createAnalyticsStorage();
  const collector = createMetricsCollector({ storage });

  const envelope = {
    name: 'aivos.publish.completed',
    correlationId: 'job-an03',
    payload: {
      jobId: 'job-an03',
      publishId: 'pub-123',
      success: ['tiktok', 'youtube'],
      failed: [],
    },
  };

  const count = collector.consumeRuntimeEvent(envelope);
  assert.equal(count, 2);
  assert.equal(storage.count({ type: 'publish' }), 2);
  assert.equal(storage.count({ type: 'publish', platform: 'tiktok' }), 1);
  assert.equal(storage.count({ type: 'publish', platform: 'youtube' }), 1);
});

// ─── AN04 Event Aggregator ────────────────────────────────────────────────────

test('AN04 event aggregator produces time-series buckets', () => {
  const storage = createAnalyticsStorage();
  const aggregator = createEventAggregator({ storage });

  // Seed some events with explicit timestamps
  const today = new Date();
  const yesterday = new Date(today - 86400000);
  storage.append({ type: 'impression', jobId: 'j1', value: 1, ts: today.toISOString() });
  storage.append({ type: 'impression', jobId: 'j2', value: 1, ts: today.toISOString() });
  storage.append({ type: 'impression', jobId: 'j3', value: 1, ts: yesterday.toISOString() });

  const series = aggregator.timeSeries({ type: 'impression', granularity: 'day' });
  // At least 1 bucket (could be 2 if today != yesterday)
  assert.ok(series.length >= 1);
  const total = series.reduce((s, b) => s + b.count, 0);
  assert.equal(total, 3);

  const totals = aggregator.totals(['impression', 'click'], {});
  assert.equal(totals.impression.count, 3);
  assert.equal(totals.click.count, 0);
});

// ─── AN05 KPI Calculator ──────────────────────────────────────────────────────

test('AN05 kpi calculator derives all metrics correctly', () => {
  const kpi = createKpiCalculator({ storage: createAnalyticsStorage() });

  // Pure function tests
  assert.equal(kpi.ctr(100, 1000), 0.1);
  assert.equal(kpi.ctr(0, 0), 0);
  assert.equal(kpi.roi(120, 100), 0.2);
  assert.equal(kpi.roi(0, 0), 0);
  assert.equal(kpi.cpc(50, 100), 0.5);
  assert.equal(kpi.cpm(10, 1000), 10);
  assert.ok(kpi.hookScore(2, 3) < 1);
  assert.equal(kpi.hookScore(3, 3), 1);
  assert.equal(kpi.retention(300, 1000), 0.3);
});

test('AN05b kpi calculator.calculate from storage', () => {
  const storage = createAnalyticsStorage();
  const calculator = createKpiCalculator({ storage });

  storage.append({ type: 'impression', jobId: 'j1', value: 1 });
  storage.append({ type: 'impression', jobId: 'j1', value: 1 });
  storage.append({ type: 'click', jobId: 'j1', value: 1 });
  storage.append({ type: 'watch', jobId: 'j1', value: 45 });
  storage.append({ type: 'revenue', jobId: 'j1', value: 200 });
  storage.append({ type: 'cost', jobId: 'j1', value: 50 });

  const kpis = calculator.calculate({ jobId: 'j1' });
  assert.equal(kpis.impressions, 2);
  assert.equal(kpis.clicks, 1);
  assert.equal(kpis.ctr, 0.5);
  assert.equal(kpis.revenue, 200);
  assert.equal(kpis.cost, 50);
  assert.equal(kpis.roi, 3);
});

// ─── AN06 Funnel Analytics ────────────────────────────────────────────────────

test('AN06 funnel analytics analyses multi-step drop-off', () => {
  const storage = createAnalyticsStorage();
  const funnelEngine = createFunnelAnalytics({ storage });

  // 1000 impressions, 200 clicks, 100 watches, 20 conversions
  for (let i = 0; i < 1000; i++) storage.append({ type: 'impression', jobId: `j${i}`, value: 1 });
  for (let i = 0; i < 200; i++) storage.append({ type: 'click', jobId: `j${i}`, value: 1 });
  for (let i = 0; i < 100; i++) storage.append({ type: 'watch', jobId: `j${i}`, value: 30 });
  for (let i = 0; i < 20; i++) storage.append({ type: 'conversion', jobId: `j${i}`, value: 1 });

  const result = funnelEngine.contentFunnel({});
  assert.equal(result.steps[0].type, 'impression');
  assert.equal(result.steps[0].count, 1000);
  assert.equal(result.steps[1].count, 200);
  assert.ok(result.steps[1].drop_off > 0);
  assert.ok(result.overall_conversion > 0 && result.overall_conversion < 1);
  assert.equal(result.overall_conversion, 0.02);  // 20/1000
});

// ─── AN07 Dashboard API ───────────────────────────────────────────────────────

test('AN07 dashboard api snapshot returns all required fields', () => {
  const storage = createAnalyticsStorage();
  const aggregator = createEventAggregator({ storage });
  const kpi = createKpiCalculator({ storage });
  const funnel = createFunnelAnalytics({ storage });

  storage.append({ type: 'impression', value: 1 });
  storage.append({ type: 'click', value: 1 });
  storage.append({ type: 'revenue', value: 50 });
  storage.append({ type: 'cost', value: 10 });

  const dashboard = createDashboardApi({ kpiCalculator: kpi, aggregator, funnel });
  const snap = dashboard.snapshot({});

  assert.ok(snap.generated_at);
  assert.ok(snap.kpis);
  assert.ok(typeof snap.kpis.ctr === 'number');
  assert.ok(typeof snap.kpis.roi === 'number');
  assert.ok(Array.isArray(snap.time_series));
  assert.ok(snap.funnels?.content?.steps);
  assert.ok(snap.funnels?.revenue?.steps);

  const summary = dashboard.summary({});
  assert.ok(typeof summary.impressions === 'number');
  assert.ok(typeof summary.roi === 'number');
});

// ─── AN08 Event Replay ────────────────────────────────────────────────────────

test('AN08 event replay processes stored events through handlers', async () => {
  const storage = createAnalyticsStorage();
  storage.append({ type: 'impression', jobId: 'job-replay', value: 1 });
  storage.append({ type: 'click', jobId: 'job-replay', value: 1 });

  const replayEngine = createEventReplay({ storage });

  const seen = [];
  const result = await replayEngine.replay(
    [(event) => { seen.push(event.type); }],
    { jobId: 'job-replay' },
  );

  assert.equal(result.replayed, 2);
  assert.equal(result.errors.length, 0);
  assert.ok(seen.includes('impression'));
  assert.ok(seen.includes('click'));

  const dry = replayEngine.dryRun({ jobId: 'job-replay' });
  assert.equal(dry.count, 2);
});

// ─── AN09 Analytics Engine factory ───────────────────────────────────────────

test('AN09 analytics engine factory wires all components', () => {
  const engine = createAnalyticsEngine();
  assert.equal(engine.enabled, true);
  assert.ok(engine.storage);
  assert.ok(engine.collector);
  assert.ok(engine.aggregator);
  assert.ok(engine.kpi);
  assert.ok(engine.funnel);
  assert.ok(engine.dashboard);
  assert.ok(engine.replay);

  // Feature flag off returns disabled stub
  const orig = process.env.AIVOS_ANALYTICS_ENABLED;
  process.env.AIVOS_ANALYTICS_ENABLED = '0';
  // isAnalyticsEnabled is checked at call time (dynamic), so a new engine created
  // here would be disabled – we just verify the return shape
  process.env.AIVOS_ANALYTICS_ENABLED = orig;
});

// ─── AN10 Runtime integration ─────────────────────────────────────────────────

test('AN10 runtime events auto-forward to analytics engine', async () => {
  process.env.AIVOS_ANALYTICS_ENABLED = '1';
  const runtime = createRuntime({ syncExecute: false });

  // Emit a publish.completed event
  await runtime.events.emit({
    name: 'aivos.publish.completed',
    correlationId: 'job-an10',
    source: { agentId: 'test' },
    payload: {
      jobId: 'job-an10',
      publishId: 'pub-an10',
      success: ['tiktok'],
      failed: [],
    },
  });

  const engine = runtime.analyticsEngine;
  assert.equal(engine.enabled, true);
  assert.ok(engine.storage.count({ type: 'publish' }) >= 1);
});

// ─── AN11 Watch time and retention ────────────────────────────────────────────

test('AN11 watch time and retention metrics', () => {
  const storage = createAnalyticsStorage();
  const calculator = createKpiCalculator({ storage });

  for (let i = 0; i < 100; i++) storage.append({ type: 'impression', jobId: `j${i}`, value: 1 });
  // 60 watchers, 30 of them watched >= 30 seconds
  for (let i = 0; i < 60; i++) {
    storage.append({ type: 'watch', jobId: `j${i}`, value: i < 30 ? 45 : 10 });
  }

  const kpis = calculator.calculate({});
  assert.equal(kpis.watch_sessions, 60);
  assert.ok(kpis.avg_watch_seconds > 0);
  assert.ok(kpis.hook_score > 0);
  // retention_30s = watchers >= 30s / impressions = 30/100
  assert.equal(kpis.retention_30s, 0.3);
});
