import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLearningEngine,
  createLearningSignals,
  createFeedbackLoop,
  createPromptLearning,
  createPromptVersioning,
  createCreativeLearning,
  createAbLearning,
  createAttribution,
  createTrendDetection,
  createCohortAnalysis,
  createAudienceSegmentation,
  createQualityLearning,
  createMemoryUpdate,
  createContinuousLearning,
} from '../lib/aivos/learning/index.js';
import { createRuntimeStore } from '../lib/aivos/runtime/runtimeStore.js';
import { createRuntimeEvents } from '../lib/aivos/runtime/runtimeEvents.js';
import { createRuntime } from '../lib/aivos/runtime/index.js';

process.env.AIVOS_LEARNING_ENABLED = '1';
process.env.AIVOS_ANALYTICS_ENABLED = '1';
process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';

const SAMPLE_KPIS = {
  ctr: 0.12,
  avg_watch_seconds: 38,
  retention_30s: 0.45,
  hook_score: 0.72,
  conversion_rate: 0.04,
  roi: 2.5,
};

// ─── L01 Learning Signals ─────────────────────────────────────────────────────

test('L01 learning signals ingest and aggregate weighted score', () => {
  const signals = createLearningSignals();

  signals.ingest({ jobId: 'job-l01', signal: 'ctr', value: 0.12 });
  signals.ingest({ jobId: 'job-l01', signal: 'watch_time', value: 0.6 });
  signals.ingest({ jobId: 'job-l01', signal: 'quality', value: 0.75 });

  const agg = signals.getAggregate('job-l01');
  assert.ok(agg);
  assert.ok(agg.weighted_score > 0);

  const top = signals.topJobs(5);
  assert.ok(top.length >= 1);
  assert.ok(top[0].weighted_score > 0);
});

test('L01b signals ingestFromKpis batch', () => {
  const signals = createLearningSignals();
  const ingested = signals.ingestFromKpis('job-l01b', SAMPLE_KPIS, { skillId: 'skill-a' });
  assert.ok(ingested.length >= 3);
  assert.ok(signals.getAggregate('job-l01b').weighted_score > 0);
});

// ─── L02 Feedback Loop ────────────────────────────────────────────────────────

test('L02 feedback loop submit and process pending', async () => {
  const signals = createLearningSignals();
  const feedback = createFeedbackLoop({ signals });

  await feedback.submit({ jobId: 'job-l02', kpis: SAMPLE_KPIS });
  await feedback.submit({ jobId: 'job-l02b', kpis: { ctr: 0.01, hook_score: 0.1 } });

  const unprocessed = feedback.listLog({ processed: false });
  assert.equal(unprocessed.length, 2);

  const result = await feedback.processPending();
  assert.equal(result.processed, 2);

  const processed = feedback.listLog({ processed: true });
  assert.equal(processed.length, 2);
});

// ─── L03 Prompt Learning + Versioning ────────────────────────────────────────

test('L03 prompt learning records performance and proposes evolution', () => {
  const pl = createPromptLearning();

  // Record 5 low-scoring observations to trigger proposal
  for (let i = 0; i < 5; i++) {
    pl.record('prompt-abc', { ctr: 0.02, hook_score: 0.1, retention_30s: 0.1 });
  }
  const proposal = pl.evaluatePerformance('prompt-abc', { ctr: 0.02, hook_score: 0.1, retention_30s: 0.1 });
  assert.ok(proposal);
  assert.equal(proposal.reason, 'underperforming');

  const approved = pl.approve(proposal.id);
  assert.equal(approved.status, 'approved');
});

test('L03b prompt versioning register, propose, approve evolution', () => {
  const pv = createPromptVersioning();
  pv.register({ promptId: 'p1', version: 1, template: { system: 'v1 system' } });

  const l = pv.latest('p1');
  assert.equal(l.version, 1);

  const ev = pv.propose({ promptId: 'p1', baseVersion: 1, proposedTemplate: { system: 'v2 system' }, reason: 'learning', score: 0.8 });
  assert.equal(ev.status, 'pending');

  const result = pv.approveEvolution(ev.id);
  assert.equal(result.version, 2);
  assert.equal(pv.latest('p1').version, 2);

  const hist = pv.history('p1');
  assert.equal(hist.length, 2);
});

// ─── L04 Creative Learning ────────────────────────────────────────────────────

test('L04 creative learning ranks templates by engagement', () => {
  const cl = createCreativeLearning();

  cl.record({ templateId: 'branded', kpis: { ctr: 0.18, hook_score: 0.8 }, jobId: 'j1' });
  cl.record({ templateId: 'branded', kpis: { ctr: 0.22, hook_score: 0.75 }, jobId: 'j2' });
  cl.record({ templateId: 'default', kpis: { ctr: 0.05, hook_score: 0.3 }, jobId: 'j3' });
  cl.record({ templateId: 'default', kpis: { ctr: 0.04, hook_score: 0.25 }, jobId: 'j4' });

  const ranked = cl.rankTemplates();
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].templateId, 'branded');
});

// ─── L05 A/B Learning ────────────────────────────────────────────────────────

test('L05 ab learning create experiment, observe, evaluate winner', () => {
  const ab = createAbLearning();
  const exp = ab.create({ name: 'hook-test', control: 'prompt-v1', variants: ['prompt-v2'], metric: 'ctr', minSamples: 3 });
  assert.ok(exp.id);
  assert.equal(exp.status, 'running');

  // 3 observations per variant
  for (let i = 0; i < 3; i++) ab.observe({ experimentId: exp.id, variantId: 'prompt-v1', value: 0.1 });
  for (let i = 0; i < 3; i++) ab.observe({ experimentId: exp.id, variantId: 'prompt-v2', value: 0.18 });

  const result = ab.evaluate(exp.id);
  assert.ok(result);
  assert.equal(result.winner, 'prompt-v2');
  assert.ok(result.lift > 0);
});

// ─── L06 Attribution ──────────────────────────────────────────────────────────

test('L06 attribution linear model distributes credit equally', () => {
  const attr = createAttribution();
  const conv = attr.record({
    jobId: 'j-l06',
    touchpoints: [
      { channel: 'tiktok', ts: '2026-06-28T01:00:00Z' },
      { channel: 'youtube', ts: '2026-06-28T02:00:00Z' },
      { channel: 'instagram', ts: '2026-06-28T03:00:00Z' },
    ],
    value: 100,
    model: 'linear',
  });

  const credits = attr.attribute(conv.id);
  assert.equal(credits.length, 3);
  const totalCredit = credits.reduce((s, c) => s + c.credit, 0);
  assert.ok(Math.abs(totalCredit - 100) < 0.001);
  assert.ok(credits.every((c) => Math.abs(c.weight - 1 / 3) < 0.001));

  const report = attr.channelReport();
  assert.ok(report.length === 3);
  assert.ok(report.every((r) => Math.abs(r.totalCredit - 100 / 3) < 0.01));
});

// ─── L07 Trend Detection ─────────────────────────────────────────────────────

test('L07 trend detection identifies rising and falling metrics', () => {
  const td = createTrendDetection();

  // Rising CTR
  for (let i = 0; i < 10; i++) td.record('ctr', 0.05 + i * 0.01);
  // Falling watch time
  for (let i = 0; i < 10; i++) td.record('watch_time', 60 - i * 2);

  const ctrTrend = td.getTrend('ctr');
  assert.equal(ctrTrend.trend, 'rising');
  const watchTrend = td.getTrend('watch_time');
  assert.equal(watchTrend.trend, 'falling');

  const rising = td.rising();
  assert.ok(rising.some((t) => t.metric === 'ctr'));
});

// ─── L08 Cohort and Segmentation ─────────────────────────────────────────────

test('L08 cohort analysis and audience segmentation', () => {
  const cohort = createCohortAnalysis();
  const segmentation = createAudienceSegmentation();

  cohort.record({ jobId: 'j1', kpis: { ctr: 0.2, hook_score: 0.8 }, granularity: 'week' });
  cohort.record({ jobId: 'j2', kpis: { ctr: 0.1, hook_score: 0.5 }, granularity: 'week' });

  const keys = cohort.listKeys();
  assert.ok(keys.length >= 1);
  const comparison = cohort.compare('ctr');
  assert.ok(comparison.length >= 1);

  const segs = segmentation.classify('j1', { ctr: 0.18, avg_watch_seconds: 50, hook_score: 0.75, retention_30s: 0.35 });
  assert.ok(segs.includes('high_ctr'));
  assert.ok(segs.includes('long_watch'));

  const dist = segmentation.stats();
  assert.ok(dist.total >= 1);
});

// ─── L09 Quality Learning ────────────────────────────────────────────────────

test('L09 quality learning correlates scores with CTR', () => {
  const ql = createQualityLearning();

  // Strong correlation: higher quality → higher CTR
  for (let i = 0; i < 10; i++) {
    ql.record({ jobId: `j${i}`, qualityScore: 0.3 + i * 0.07, kpis: { ctr: 0.05 + i * 0.01 } });
  }

  const corr = ql.correlation('ctr');
  assert.ok(corr !== null);
  assert.ok(corr > 0.5); // strong positive correlation expected
});

// ─── L10 Memory Update ────────────────────────────────────────────────────────

test('L10 memory update pushes proposal to kernel (stub)', async () => {
  const mu = createMemoryUpdate();
  const result = await mu.push({ key: 'learning/prompt-abc', content: 'improved prompt pattern', ownerId: 'system', score: 0.8 });
  assert.equal(result.pushed, true);
  assert.equal(result.stub, true);

  const batchResult = await mu.pushBatch([
    { key: 'learning/template-branded', content: 'high_ctr_template', ownerId: 'system', score: 0.9 },
    { key: 'learning/audience-seg-tiktok', content: 'young_adult_18_24', ownerId: 'system', score: 0.7 },
  ]);
  assert.equal(batchResult.total, 2);
  assert.equal(batchResult.pushed, 2);
});

// ─── L11 Learning Engine factory + ingestPublishedJob ────────────────────────

test('L11 learning engine ingestPublishedJob full flow', async () => {
  const engine = createLearningEngine();
  assert.equal(engine.enabled, true);

  const result = await engine.ingestPublishedJob({
    jobId: 'job-l11',
    skillId: 'resume-extract-profile',
    promptId: 'talent-resume-draft',
    templateId: 'branded',
    kpis: SAMPLE_KPIS,
    status: 'published',
  });
  assert.equal(result.accepted, true);
  assert.ok(result.feedbackId);

  // Draft excluded
  const draft = await engine.ingestPublishedJob({ jobId: 'draft-l11', kpis: SAMPLE_KPIS, status: 'draft' });
  assert.equal(draft.accepted, false);
  assert.equal(draft.reason, 'draft_excluded');
});

// ─── L12 Runtime integration – learning engine wired ─────────────────────────

test('L12 runtime exposes learningEngine and continuous learning consumes events', async () => {
  process.env.AIVOS_LEARNING_ENABLED = '1';
  const runtime = createRuntime({ syncExecute: false });
  const le = runtime.learningEngine;
  assert.equal(le.enabled, true);
  assert.ok(le.signals);
  assert.ok(le.feedback);
  assert.ok(le.ab);
  assert.ok(le.attribution);

  // Emit a publish event – should be consumed by continuousLearning
  await runtime.events.emit({
    name: 'aivos.publish.completed',
    correlationId: 'job-l12',
    source: { agentId: 'test' },
    payload: { jobId: 'job-l12', publishId: 'pub-l12', success: ['tiktok'], failed: [] },
  });

  const trendStatus = le.continuous.status();
  // pending count should be 1 after the publish event
  assert.ok(trendStatus.pending >= 1);
});
