#!/usr/bin/env node
/**
 * Phase 20 Sprint 20.5 — Growth load test harness (§25 + §40.6).
 */
import { performance } from 'node:perf_hooks';
import { createRuntime } from '../lib/aivos/runtime/index.js';

process.env.AIVOS_GROWTH_ENABLED = '1';
process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_INTEGRATION_ENABLED = '1';
process.env.AIVOS_TENANT_ENABLED = '1';
process.env.AIVOS_APPLICATION_ENABLED = '1';
process.env.AIVOS_WORKFLOW_ENABLED = '1';
process.env.AIVOS_REVENUE_ENABLED = '1';
process.env.AIVOS_BILLING_ENABLED = '1';

const mockBillingGrowth = {
  getGrowthStatus: async (userId) => ({ userId, ai_video_credits: 10, tier: 'premium' }),
};

const CHURN_USERS = Number(process.env.GROWTH_LOAD_CHURN_USERS || 10000);
const FEED_SAMPLES = Number(process.env.GROWTH_LOAD_FEED_SAMPLES || 100);
const CHURN_BUDGET_MS = Number(process.env.GROWTH_LOAD_CHURN_BUDGET_MS || 30000);
const FEED_P95_BUDGET_MS = Number(process.env.GROWTH_LOAD_FEED_P95_MS || 200);

const rt = createRuntime({ syncExecute: true, growthEngine: mockBillingGrowth });

console.log('Growth load test — Sprint 20.5');
console.log(`  churn users: ${CHURN_USERS} (budget ${CHURN_BUDGET_MS}ms)`);
console.log(`  feed samples: ${FEED_SAMPLES} (P95 budget ${FEED_P95_BUDGET_MS}ms)`);

const churnStart = performance.now();
for (let i = 0; i < CHURN_USERS; i += 1) {
  rt.growth.churn.score({ tenantId: `t-load-${i % 100}`, userId: `u-${i}` });
}
const churnMs = performance.now() - churnStart;

const feedTimings = [];
for (let i = 0; i < FEED_SAMPLES; i += 1) {
  const ctx = { tenantId: 't-perf', userId: `u-perf-${i}` };
  rt.growth.seedUserContext(ctx);
  const t0 = performance.now();
  rt.growth.feed.list(ctx);
  feedTimings.push(performance.now() - t0);
}
feedTimings.sort((a, b) => a - b);
const feedP95 = feedTimings[Math.floor(feedTimings.length * 0.95)] || 0;

const churnPass = churnMs < CHURN_BUDGET_MS;
const feedPass = feedP95 < FEED_P95_BUDGET_MS;

console.log('');
console.log(`Churn batch: ${churnMs.toFixed(1)}ms — ${churnPass ? 'PASS' : 'FAIL'}`);
console.log(`Feed P95:    ${feedP95.toFixed(2)}ms — ${feedPass ? 'PASS' : 'FAIL'}`);

const report = {
  ok: churnPass && feedPass,
  churn: { users: CHURN_USERS, ms: churnMs, budgetMs: CHURN_BUDGET_MS, pass: churnPass },
  feed: { samples: FEED_SAMPLES, p95Ms: feedP95, budgetMs: FEED_P95_BUDGET_MS, pass: feedPass },
  at: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
