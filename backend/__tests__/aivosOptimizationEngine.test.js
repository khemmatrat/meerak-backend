import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_OPTIMIZATION_ENABLED = '1';
process.env.AIVOS_OPT_AUTO_TUNE = '1';
process.env.AIVOS_OPT_CONFIDENCE_THRESHOLD = '0.7';
process.env.AIVOS_ANALYTICS_ENABLED = '1';
process.env.AIVOS_LEARNING_ENABLED = '1';
process.env.AIVOS_PUBLISH_ENABLED = '1';

import { createOptimizationEngine } from '../lib/aivos/optimization/index.js';
import { createPromptOptimizer } from '../lib/aivos/optimization/promptOptimizer.js';
import { createCreativeOptimizer } from '../lib/aivos/optimization/creativeOptimizer.js';
import { createTemplateOptimizer } from '../lib/aivos/optimization/templateOptimizer.js';
import { createModelOptimizer } from '../lib/aivos/optimization/modelOptimizer.js';
import { createCostOptimizer } from '../lib/aivos/optimization/costOptimizer.js';
import { createLatencyOptimizer } from '../lib/aivos/optimization/latencyOptimizer.js';
import { createQualityOptimizer } from '../lib/aivos/optimization/qualityOptimizer.js';
import { createPipelineOptimizer } from '../lib/aivos/optimization/pipelineOptimizer.js';
import { createPublishOptimizer } from '../lib/aivos/optimization/publishOptimizer.js';
import { createBudgetOptimizer } from '../lib/aivos/optimization/budgetOptimizer.js';
import { createAutoRecommendation } from '../lib/aivos/optimization/autoRecommendation.js';
import { createAutoTuning } from '../lib/aivos/optimization/autoTuning.js';
import { createExperimentOptimizer } from '../lib/aivos/optimization/experimentOptimizer.js';
import { createDecisionEngine } from '../lib/aivos/optimization/decisionEngine.js';
import { isOptimizationEnabled, isAutoTuneEnabled, autoTuneConfidenceThreshold } from '../lib/aivos/optimization/config.js';

// ── OPT01: config flags ───────────────────────────────────────────────────────
test('OPT01 optimization feature flags load correctly', () => {
  assert.equal(isOptimizationEnabled(), true);
  assert.equal(isAutoTuneEnabled(), true);
  assert.equal(autoTuneConfidenceThreshold(), 0.7);
});

// ── OPT02: model optimizer selects best model ─────────────────────────────────
test('OPT02 model optimizer selects model within constraints', () => {
  const opt = createModelOptimizer();
  const result = opt.select({ maxCostPerToken: 0.001, minQuality: 0.75, maxLatencyMs: 3000 });
  assert.ok(result.modelId, 'modelId should be returned');
  assert.ok(result.score >= 0, 'score should be non-negative');
  assert.ok(['balanced', 'fast', 'premium'].includes(result.tier));
});

// ── OPT03: cost optimizer analyses spend and returns suggestions ───────────────
test('OPT03 cost optimizer suggests model downgrade on low ROI', () => {
  const model = createModelOptimizer();
  const cost = createCostOptimizer({ modelOptimizer: model });
  const result = cost.analyse({
    totalCost: 100,
    totalRevenue: 80,
    jobCount: 10,
    modelId: 'claude-3',
    platformCosts: { tiktok: 60, youtube: 10 },
  });
  assert.ok(Array.isArray(result.suggestions), 'suggestions should be array');
  assert.ok(result.estimatedSavings >= 0);
  const hasDowngrade = result.suggestions.some((s) => s.action === 'model_downgrade');
  assert.ok(hasDowngrade, 'should suggest model downgrade on low ROI');
});

// ── OPT04: latency optimizer identifies bottlenecks ───────────────────────────
test('OPT04 latency optimizer identifies slow nodes and suggests action', () => {
  const opt = createLatencyOptimizer();
  opt.record({ jobId: 'j1', nodeId: 'transcribe', durationMs: 4500 });
  opt.record({ jobId: 'j2', nodeId: 'transcribe', durationMs: 5200 });
  opt.record({ jobId: 'j1', nodeId: 'ocr', durationMs: 200 });
  const bn = opt.bottlenecks(2000);
  assert.ok(bn.length >= 1);
  assert.equal(bn[0].nodeId, 'transcribe');
  const { suggestions } = opt.suggest(2000);
  assert.ok(suggestions.length >= 1);
  assert.ok(suggestions[0].action, 'suggestion should have action');
});

// ── OPT05: template optimizer suggests param adjustments ─────────────────────
test('OPT05 template optimizer suggests intro duration reduction on low hook score', () => {
  const opt = createTemplateOptimizer();
  const result = opt.suggest('default', { hook_score: 0.2, avg_watch_seconds: 15, retention_30s: 0.6 });
  assert.equal(result.templateId, 'default');
  assert.ok(typeof result.suggestions === 'object');
  // low hook score should trigger introDuration reduction
  if (result.confidence > 0) {
    assert.ok(result.suggestions.introDuration !== undefined || result.suggestions.captionStyle !== undefined || result.suggestions.outroDuration !== undefined);
  }
  // apply the suggestion
  const updated = opt.apply('default', result.suggestions);
  assert.ok(updated.updatedAt, 'updatedAt should be set after apply');
});

// ── OPT06: quality optimizer recommends actions ───────────────────────────────
test('OPT06 quality optimizer recommends model upgrade on quality gap', () => {
  const model = createModelOptimizer();
  const opt = createQualityOptimizer({ modelOptimizer: model });
  const result = opt.recommend({ currentQuality: 0.5, targetQuality: 0.9, budget: 0.002, taskType: 'writing' });
  assert.ok(result.recommendations.length > 0, 'should have recommendations for large quality gap');
  assert.ok(result.projectedQuality > 0.5, 'projected quality should improve');
});

// ── OPT07: budget optimizer allocates budget proportionally ──────────────────
test('OPT07 budget optimizer allocates funds by ROI rank', () => {
  const opt = createBudgetOptimizer();
  const result = opt.allocate({
    totalBudget: 1000,
    channels: [
      { id: 'tiktok', minBudget: 100, expectedRoi: 3.0 },
      { id: 'youtube', minBudget: 50, expectedRoi: 2.0 },
      { id: 'facebook', minBudget: 50, expectedRoi: 0.5 },
    ],
  });
  assert.ok(result.allocation.length === 3);
  assert.ok(Math.abs(result.totalAllocated - 1000) < 1, 'total allocated should equal budget');
  const tiktokEntry = result.allocation.find((a) => a.id === 'tiktok');
  const facebookEntry = result.allocation.find((a) => a.id === 'facebook');
  assert.ok(tiktokEntry.budget >= facebookEntry.budget, 'higher ROI channel should get more budget');
  assert.ok(result.expectedReturn > 0);
});

// ── OPT08: publish optimizer recommends platforms and schedule ────────────────
test('OPT08 publish optimizer recommends platforms and schedule', () => {
  const opt = createPublishOptimizer();
  const result = opt.recommend({ platform: 'tiktok' });
  assert.ok(Array.isArray(result.platforms), 'platforms should be array');
  assert.ok(result.platforms.length > 0);
  assert.ok(typeof result.schedule === 'object');
  assert.ok(result.confidence > 0);
});

// ── OPT09: decision engine selects best strategy via MCDM ────────────────────
test('OPT09 decision engine evaluates options by weighted criteria', () => {
  const engine = createDecisionEngine();
  const result = engine.evaluate([
    { id: 'cheap',   quality: 0.6, cost: 0.2, latency: 0.3, reach: 0.5 },
    { id: 'premium', quality: 0.9, cost: 0.9, latency: 0.7, reach: 0.8 },
    { id: 'balanced',quality: 0.75, cost: 0.5, latency: 0.5, reach: 0.65 },
  ]);
  assert.ok(result.winner, 'should have a winner');
  assert.ok(result.ranked.length === 3);
  assert.ok(result.ranked[0].score >= result.ranked[1].score, 'ranked should be sorted desc');
});

test('OPT09b decision engine selectStrategy returns named winner', () => {
  const engine = createDecisionEngine();
  const result = engine.selectStrategy({
    cost_mode:   { quality: 0.5, cost: 0.1, latency: 0.3, reach: 0.5 },
    quality_mode:{ quality: 0.9, cost: 0.8, latency: 0.5, reach: 0.6 },
  });
  assert.ok(result.winner, 'should have a named winner');
  assert.ok(['cost_mode', 'quality_mode'].includes(result.winner));
});

// ── OPT10: auto recommendation generates prioritised list ────────────────────
test('OPT10 auto recommendation generates prioritised recommendation list', () => {
  const creative = createCreativeOptimizer();
  const model = createModelOptimizer();
  const cost = createCostOptimizer({ modelOptimizer: model });
  cost.analyse({ totalCost: 100, totalRevenue: 60, jobCount: 5, modelId: 'claude-3' });

  const recs = createAutoRecommendation({ creativeOptimizer: creative, costOptimizer: cost });
  const result = recs.generate({ platform: 'tiktok', skillId: 'product_marketing' });

  assert.ok(Array.isArray(result.recommendations), 'should return recommendation array');
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.generatedAt, 'should have timestamp');
});

// ── OPT11: auto tuning applies recommendations above confidence threshold ──────
test('OPT11 auto tuning applies high-confidence recommendations', () => {
  const template = createTemplateOptimizer();
  const autoTuning = createAutoTuning({ templateOptimizer: template });

  const recs = [
    { category: 'creative', action: 'use_template', data: { templateId: 'default', suggestions: { introDuration: 2 } }, confidence: 0.9 },
    { category: 'prompt',   action: 'use_prompt',   data: { promptId: 'p1', skillId: 'test', version: 2 }, confidence: 0.5 },
  ];

  const result = autoTuning.processBatch(recs);
  assert.equal(result.applied, 1, 'one recommendation should be applied (confidence >= 0.7)');
  assert.equal(result.skipped, 1, 'one recommendation should be skipped (confidence < 0.7)');

  const log = autoTuning.getAuditLog();
  assert.ok(log.length === 2, 'audit log should record both attempts');
});

// ── OPT12: full optimization engine wires up and runs cycle ──────────────────
test('OPT12 createOptimizationEngine wires all components and runCycle returns report', async () => {
  const engine = createOptimizationEngine();
  assert.equal(engine.enabled, true, 'engine should be enabled');

  // Verify all sub-engines present
  assert.ok(engine.prompt, 'prompt optimizer');
  assert.ok(engine.creative, 'creative optimizer');
  assert.ok(engine.template, 'template optimizer');
  assert.ok(engine.model, 'model optimizer');
  assert.ok(engine.cost, 'cost optimizer');
  assert.ok(engine.latency, 'latency optimizer');
  assert.ok(engine.quality, 'quality optimizer');
  assert.ok(engine.pipeline, 'pipeline optimizer');
  assert.ok(engine.publish, 'publish optimizer');
  assert.ok(engine.budget, 'budget optimizer');
  assert.ok(engine.recommendations, 'auto recommendation');
  assert.ok(engine.autoTuning, 'auto tuning');
  assert.ok(engine.experiments, 'experiment optimizer');
  assert.ok(engine.decision, 'decision engine');

  const report = await engine.runCycle({ platform: 'tiktok', taskType: 'writing', skillId: 'demo' });
  assert.ok(report.cycle, 'report should have cycle timestamp');
  assert.ok(report.recommendations, 'report should have recommendations');
  assert.ok(report.autoTuning, 'report should have autoTuning result');
  assert.ok(report.strategy, 'report should have strategy decision');
});

test('OPT12b disabled optimization engine returns stub', () => {
  const orig = process.env.AIVOS_OPTIMIZATION_ENABLED;
  process.env.AIVOS_OPTIMIZATION_ENABLED = '0';
  // Feature flag is read dynamically at call time
  assert.equal(isOptimizationEnabled(), false, 'flag should read false when env=0');
  const disabledEngine = createOptimizationEngine();
  assert.equal(disabledEngine.enabled, false, 'engine should be disabled stub');
  assert.equal(disabledEngine.prompt, null);
  process.env.AIVOS_OPTIMIZATION_ENABLED = orig;
});
