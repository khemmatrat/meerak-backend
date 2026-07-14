import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_REVENUE_ENABLED = '1';
process.env.AIVOS_REVENUE_TAKE_RATE = '0.20';
process.env.AIVOS_REVENUE_CURRENCY = 'THB';
process.env.AIVOS_ANALYTICS_ENABLED = '1';
process.env.AIVOS_LEARNING_ENABLED = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED = '1';
process.env.AIVOS_AUTOMATION_ENABLED = '1';
process.env.AIVOS_PUBLISH_ENABLED = '1';

import { createRevenueGrowthEngine }  from '../lib/aivos/revenue/index.js';
import { createRevenueAttribution }   from '../lib/aivos/revenue/revenueAttribution.js';
import { createRevenueForecasting }   from '../lib/aivos/revenue/revenueForecasting.js';
import { createLtvPrediction }        from '../lib/aivos/revenue/ltvPrediction.js';
import { createCacTracking }          from '../lib/aivos/revenue/cacTracking.js';
import { createRoasCalculator }       from '../lib/aivos/revenue/roasCalculator.js';
import { createProfitEngine }         from '../lib/aivos/revenue/profitEngine.js';
import { createPricingOptimizer }     from '../lib/aivos/revenue/pricingOptimizer.js';
import { createCommissionEngine }     from '../lib/aivos/revenue/commissionEngine.js';
import { createSubscriptionRevenue }  from '../lib/aivos/revenue/subscriptionRevenue.js';
import { createMarketplaceRevenue }   from '../lib/aivos/revenue/marketplaceRevenue.js';
import { createMerchantRevenue }      from '../lib/aivos/revenue/merchantRevenue.js';
import { createAiServiceRevenue }     from '../lib/aivos/revenue/aiServiceRevenue.js';
import { createRevenueDashboard }     from '../lib/aivos/revenue/revenueDashboard.js';
import { createRevenueRecommendation } from '../lib/aivos/revenue/revenueRecommendation.js';
import { createRevenueStrategyEngine } from '../lib/aivos/revenue/revenueStrategyEngine.js';
import { isRevenueEnabled, defaultTakeRate, revenueCurrency } from '../lib/aivos/revenue/config.js';

// ── RV01: config ──────────────────────────────────────────────────────────────
test('RV01 revenue config flags load correctly', () => {
  assert.equal(isRevenueEnabled(), true);
  assert.equal(defaultTakeRate(), 0.20);
  assert.equal(revenueCurrency(), 'THB');
});

// ── RV02: revenue attribution ─────────────────────────────────────────────────
test('RV02 revenue attribution – linear model distributes equally', () => {
  const attr = createRevenueAttribution();
  const entry = attr.record({ conversionId: 'c1', value: 300, touchpoints: [{ channel: 'tiktok' }, { channel: 'google' }, { channel: 'organic' }], model: 'linear' });
  assert.equal(entry.credits.length, 3);
  assert.ok(Math.abs(entry.credits[0].credit - 100) < 0.01, 'each channel gets 100');

  const byChannel = attr.byChannel();
  assert.ok(byChannel['tiktok'] > 0);
  assert.equal(Math.round(attr.total()), 300);
});

test('RV02b revenue attribution – last_touch credits only final channel', () => {
  const attr = createRevenueAttribution();
  attr.record({ conversionId: 'c2', value: 200, touchpoints: [{ channel: 'email' }, { channel: 'direct' }], model: 'last_touch' });
  const ch = attr.byChannel({ model: 'last_touch' });
  assert.equal(ch['direct'], 200);
  assert.equal(ch['email'], 0);
});

// ── RV03: revenue forecasting ─────────────────────────────────────────────────
test('RV03 revenue forecasting projects future periods via linear regression', () => {
  const fc = createRevenueForecasting();
  [100, 120, 140, 160, 180].forEach((v, i) => fc.record(`w${i}`, v));
  const result = fc.forecast({ periods: 3, method: 'linear' });
  assert.equal(result.forecasts.length, 3);
  assert.ok(result.forecasts[0].value > 180, 'forecast should continue upward trend');
  assert.ok(result.confidence > 0.5, 'high confidence for clear linear trend');
});

// ── RV04: LTV prediction ──────────────────────────────────────────────────────
test('RV04 ltv prediction calculates LTV and segments customers', () => {
  const ltv = createLtvPrediction();
  ltv.recordPurchase({ customerId: 'c1', value: 500 });
  ltv.recordPurchase({ customerId: 'c1', value: 600 });
  ltv.recordPurchase({ customerId: 'c2', value: 100 });

  const p1 = ltv.predict('c1', { grossMargin: 0.6, lifespanMonths: 12 });
  assert.ok(p1.ltv > 0, 'LTV should be positive');
  assert.equal(p1.purchaseCount, 2);
  assert.ok(p1.arpu === 550, 'ARPU = (500+600)/2');

  const segments = ltv.segment();
  assert.ok(segments.high.includes('c1'), 'c1 should be in high LTV segment');

  const avg = ltv.avgLtv();
  assert.ok(avg > 0);
});

// ── RV05: CAC tracking ────────────────────────────────────────────────────────
test('RV05 cac tracking calculates cost per acquisition', () => {
  const cac = createCacTracking();
  cac.recordSpend({ channel: 'tiktok', amount: 5000 });
  cac.recordSpend({ channel: 'google', amount: 3000 });
  cac.recordAcquisition({ channel: 'tiktok', customerId: 'u1' });
  cac.recordAcquisition({ channel: 'tiktok', customerId: 'u2' });
  cac.recordAcquisition({ channel: 'google', customerId: 'u3' });

  const overall = cac.calculate();
  assert.equal(overall.totalSpend, 8000);
  assert.equal(overall.newCustomers, 3);
  assert.ok(Math.abs(overall.cac - 8000/3) < 0.01);

  const tiktokCac = cac.calculate({ channel: 'tiktok' });
  assert.equal(tiktokCac.cac, 2500);
});

// ── RV06: ROAS calculator ─────────────────────────────────────────────────────
test('RV06 roas calculator computes roas and gap analysis', () => {
  const roas = createRoasCalculator();
  roas.record({ channel: 'tiktok', adSpend: 1000, attributedRevenue: 3500 });
  roas.record({ channel: 'google', adSpend: 2000, attributedRevenue: 4000 });

  const result = roas.calculate();
  assert.ok(result.roas > 0, 'roas should be positive');
  assert.equal(result.totalSpend, 3000);
  assert.equal(result.totalRevenue, 7500);

  const gap = roas.gapAnalysis(4);
  assert.ok(typeof gap.gap === 'number');
  assert.ok(typeof gap.onTarget === 'boolean');
});

// ── RV07: profit engine ───────────────────────────────────────────────────────
test('RV07 profit engine calculates gross and net profit with margins', () => {
  const profit = createProfitEngine();
  profit.recordRevenue({ stream: 'marketplace', amount: 10000 });
  profit.recordRevenue({ stream: 'subscription', amount: 5000 });
  profit.recordCost({ bucket: 'cogs', amount: 3000 });
  profit.recordCost({ bucket: 'ops', amount: 2000 });
  profit.recordCost({ bucket: 'marketing', amount: 1000 });

  const calc = profit.calculate();
  assert.equal(calc.grossRevenue, 15000);
  assert.equal(calc.cogs, 3000);
  assert.equal(calc.grossProfit, 12000);
  assert.ok(Math.abs(calc.grossMargin - 0.8) < 0.001);
  assert.equal(calc.netProfit, 9000);

  const streams = profit.byStream();
  assert.equal(streams.length, 2);
});

// ── RV08: pricing optimizer ───────────────────────────────────────────────────
test('RV08 pricing optimizer recommends optimal price from history', () => {
  const opt = createPricingOptimizer();
  opt.registerProduct({ productId: 'course_ai', minPrice: 199, maxPrice: 2999, elasticity: -1.5 });
  opt.recordDataPoint({ productId: 'course_ai', price: 299, demand: 100, revenue: 29900 });
  opt.recordDataPoint({ productId: 'course_ai', price: 499, demand: 80,  revenue: 39920 });
  opt.recordDataPoint({ productId: 'course_ai', price: 799, demand: 40,  revenue: 31960 });

  const rec = opt.recommend('course_ai');
  assert.ok(rec.recommendedPrice >= 199, 'price above minimum');
  assert.ok(rec.recommendedPrice <= 2999, 'price below maximum');
  assert.ok(rec.confidence > 0.3);
});

// ── RV09: commission engine ───────────────────────────────────────────────────
test('RV09 commission engine calculates platform commission and payout', () => {
  const engine = createCommissionEngine();
  const result = engine.calculate({ transactionId: 'tx1', sellerId: 'seller_1', gmv: 1000 });
  assert.ok(Math.abs(result.commission - 200) < 0.01, '20% default take rate');
  assert.equal(result.payout, 800);

  engine.setRate('seller_1', 0.15);
  const result2 = engine.calculate({ transactionId: 'tx2', sellerId: 'seller_1', gmv: 1000 });
  assert.equal(result2.commission, 150);

  const summary = engine.summary('seller_1');
  assert.equal(summary.transactionCount, 2);
  assert.equal(summary.totalGmv, 2000);
});

// ── RV10: subscription revenue ────────────────────────────────────────────────
test('RV10 subscription revenue tracks MRR, ARR, and churn', () => {
  const sub = createSubscriptionRevenue();
  sub.subscribe({ subId: 's1', plan: 'pro', mrr: 499 });
  sub.subscribe({ subId: 's2', plan: 'pro', mrr: 499 });
  sub.subscribe({ subId: 's3', plan: 'basic', mrr: 199 });
  sub.churn('s3');

  const m = sub.metrics();
  assert.equal(m.activeSubscribers, 2);
  assert.equal(m.mrr, 998);
  assert.equal(m.arr, 998 * 12);
  assert.ok(m.churnRate > 0, 'churn rate should be above 0');
});

// ── RV11: marketplace revenue ─────────────────────────────────────────────────
test('RV11 marketplace revenue tracks GMV and net revenue', () => {
  const mp = createMarketplaceRevenue();
  mp.recordOrder({ orderId: 'o1', category: 'course',   gmv: 500 });
  mp.recordOrder({ orderId: 'o2', category: 'course',   gmv: 1000 });
  mp.recordOrder({ orderId: 'o3', category: 'service',  gmv: 800 });

  const m = mp.metrics();
  assert.equal(m.totalGmv, 2300);
  assert.ok(Math.abs(m.totalNetRevenue - 460) < 0.01, '20% take rate on 2300');
  assert.equal(m.orderCount, 3);

  const byCat = mp.byCategory();
  assert.equal(byCat.length, 2);
  const courseCat = byCat.find((c) => c.category === 'course');
  assert.equal(courseCat.totalGmv, 1500);
});

// ── RV12: merchant revenue ────────────────────────────────────────────────────
test('RV12 merchant revenue tracks per-merchant sales and ranks', () => {
  const mr = createMerchantRevenue();
  mr.registerMerchant({ merchantId: 'm1', name: 'Shop A', tier: 'gold' });
  mr.registerMerchant({ merchantId: 'm2', name: 'Shop B', tier: 'standard' });
  mr.recordSale({ merchantId: 'm1', orderId: 'o1', gmv: 2000 });
  mr.recordSale({ merchantId: 'm1', orderId: 'o2', gmv: 3000 });
  mr.recordSale({ merchantId: 'm2', orderId: 'o3', gmv: 500  });

  const report = mr.report('m1');
  assert.equal(report.totalGmv, 5000);
  assert.equal(report.saleCount, 2);

  const ranked = mr.rankMerchants();
  assert.equal(ranked[0].merchantId, 'm1', 'm1 should rank first');
});

// ── RV13: AI service revenue ──────────────────────────────────────────────────
test('RV13 ai service revenue tracks usage billing', () => {
  const ai = createAiServiceRevenue();
  ai.registerService({ serviceId: 'video_render', unitPrice: 5, billType: 'per_call' });
  ai.registerService({ serviceId: 'ai_prompt',    unitPrice: 0.01, billType: 'per_token' });

  ai.recordUsage({ serviceId: 'video_render', customerId: 'c1', units: 10 });
  ai.recordUsage({ serviceId: 'ai_prompt',    customerId: 'c1', units: 1000 });
  ai.recordUsage({ serviceId: 'video_render', customerId: 'c2', units: 5 });

  const total = ai.revenue();
  assert.equal(total.totalAmount, 10 * 5 + 1000 * 0.01 + 5 * 5, '60 + 10 + 25 = 95');

  const top = ai.topCustomers(2);
  assert.equal(top.length, 2);
  assert.ok(top[0].amount >= top[1].amount, 'sorted desc');
});

// ── RV14: revenue dashboard ───────────────────────────────────────────────────
test('RV14 revenue dashboard assembles a complete snapshot', () => {
  const profit = createProfitEngine();
  profit.recordRevenue({ stream: 'total', amount: 50000 });
  profit.recordCost({ bucket: 'cogs', amount: 10000 });

  const sub = createSubscriptionRevenue();
  sub.subscribe({ subId: 's1', plan: 'pro', mrr: 2000 });

  const dashboard = createRevenueDashboard({ profitEngine: profit, subscriptionRevenue: sub });
  const snap = dashboard.snapshot();

  assert.ok(snap.ts, 'timestamp');
  assert.ok(snap.profit, 'profit section');
  assert.ok(snap.subscription, 'subscription section');
  assert.ok(snap.totalRevenue >= 0);

  const summary = dashboard.summary();
  assert.ok(typeof summary.mrr === 'number');
  assert.ok(typeof summary.grossMargin === 'number');
});

// ── RV15: revenue recommendation ─────────────────────────────────────────────
test('RV15 revenue recommendation generates prioritised list', () => {
  const profit = createProfitEngine();
  profit.recordRevenue({ stream: 'main', amount: 100 });
  profit.recordCost({ bucket: 'cogs', amount: 60 }); // 40% gross margin → triggers low margin rec
  const dashboard = createRevenueDashboard({ profitEngine: profit });

  const recEngine = createRevenueRecommendation({ revenueDashboard: dashboard });
  const result = recEngine.generate();

  assert.ok(Array.isArray(result.recommendations));
  assert.ok(result.totalCount >= 0);
  assert.ok(result.generatedAt);
  // Should detect low gross margin
  const marginRec = result.recommendations.find((r) => r.action === 'reduce_cogs');
  assert.ok(marginRec, 'should recommend margin improvement');
});

// ── RV16: revenue strategy engine ────────────────────────────────────────────
test('RV16 revenue strategy engine selects strategy based on health', () => {
  const sub = createSubscriptionRevenue();
  sub.subscribe({ subId: 's1', plan: 'basic', mrr: 100 });
  sub.churn('s1'); // high churn
  sub.subscribe({ subId: 's2', plan: 'basic', mrr: 100 });

  const dashboard = createRevenueDashboard({ subscriptionRevenue: sub });
  const strategy  = createRevenueStrategyEngine({ revenueDashboard: dashboard });
  const selected  = strategy.select();

  assert.ok(selected.strategy, 'strategy should be selected');
  assert.ok(['acquire', 'retain', 'expand', 'monetise', 'consolidate'].includes(selected.strategy));
  assert.ok(selected.confidence > 0);
  assert.ok(selected.rationale);

  const all = strategy.listStrategies();
  assert.equal(all.length, 5);
});

// ── RV17: commission engine rate override ─────────────────────────────────────
test('RV17 commission engine respects per-seller rate override', () => {
  const engine = createCommissionEngine();
  engine.setRate('vip_seller', 0.10);
  const result = engine.calculate({ transactionId: 'tx_vip', sellerId: 'vip_seller', gmv: 10000 });
  assert.equal(result.commission, 1000);
  assert.equal(result.payout, 9000);
});

// ── RV18: revenue forecasting moving average ──────────────────────────────────
test('RV18 revenue forecasting moving average method', () => {
  const fc = createRevenueForecasting();
  [200, 210, 220, 230, 240].forEach((v, i) => fc.record(`p${i}`, v));
  const result = fc.forecast({ periods: 2, method: 'moving_avg' });
  assert.equal(result.forecasts.length, 2);
  assert.ok(result.forecasts[0].value > 0);
});

// ── RV19: full revenue growth engine factory ──────────────────────────────────
test('RV19 createRevenueGrowthEngine wires all 15 components', () => {
  const engine = createRevenueGrowthEngine();
  assert.equal(engine.enabled, true);
  assert.equal(engine.currency, 'THB');

  // Verify all sub-engines present
  assert.ok(engine.attribution, 'attribution');
  assert.ok(engine.forecasting, 'forecasting');
  assert.ok(engine.ltv,         'ltv');
  assert.ok(engine.cac,         'cac');
  assert.ok(engine.roas,        'roas');
  assert.ok(engine.profit,      'profit');
  assert.ok(engine.pricing,     'pricing');
  assert.ok(engine.commission,  'commission');
  assert.ok(engine.subscription,'subscription');
  assert.ok(engine.marketplace, 'marketplace');
  assert.ok(engine.merchant,    'merchant');
  assert.ok(engine.aiService,   'aiService');
  assert.ok(engine.dashboard,   'dashboard');
  assert.ok(engine.recommendations, 'recommendations');
  assert.ok(engine.strategy,    'strategy');

  assert.equal(typeof engine.runCycle, 'function');
  assert.equal(typeof engine.consumeKpiUpdate, 'function');
});

test('RV19b runCycle returns consolidated report', () => {
  const engine = createRevenueGrowthEngine();
  // Seed some data
  engine.profit.recordRevenue({ stream: 'marketplace', amount: 20000 });
  engine.profit.recordCost({ bucket: 'cogs', amount: 4000 });
  engine.subscription.subscribe({ subId: 'rv_s1', plan: 'pro', mrr: 1000 });

  const report = engine.runCycle({ context: 'test' });
  assert.ok(report.cycle, 'cycle timestamp');
  assert.ok(report.snapshot, 'revenue snapshot');
  assert.ok(report.recommendations, 'recommendations');
  assert.ok(report.strategy, 'strategy decision');
});

// ── RV20: disabled revenue engine returns stub ────────────────────────────────
test('RV20 disabled revenue engine returns stub with enabled=false', () => {
  const orig = process.env.AIVOS_REVENUE_ENABLED;
  process.env.AIVOS_REVENUE_ENABLED = '0';
  assert.equal(isRevenueEnabled(), false);
  const stub = createRevenueGrowthEngine();
  assert.equal(stub.enabled, false);
  assert.equal(stub.attribution, null);
  assert.equal(stub.dashboard, null);
  process.env.AIVOS_REVENUE_ENABLED = orig;
});
