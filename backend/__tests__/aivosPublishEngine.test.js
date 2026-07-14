import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublishEngine,
  createPublishService,
  createPublishQueue,
  createPublishHistory,
  createDraftManager,
  createScheduler,
  createWebhookHandler,
  createTikTokAdapter,
  createYouTubeAdapter,
} from '../lib/aivos/publish/index.js';
import { createPipelineExecutor } from '../lib/aivos/pipeline/executionGraph.js';
import { getVideoPipelineTemplate } from '../lib/aivos/pipeline/templates/videoPipelineV1.js';
import { createRuntimeStore } from '../lib/aivos/runtime/runtimeStore.js';
import { createCheckpointManager } from '../lib/aivos/runtime/checkpointManager.js';
import { createRuntimeEvents } from '../lib/aivos/runtime/runtimeEvents.js';
import { createObservability } from '../lib/aivos/runtime/observability.js';

process.env.AIVOS_PUBLISH_ENABLED = '1';
process.env.AIVOS_RENDER_ENABLED = '1';

const STUB_ARTIFACT = {
  uri: 'file:///tmp/aivos_stub_video.mp4',
  thumbnail: 'file:///tmp/aivos_stub_thumb.jpg',
  hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  version: '1.0.0',
  template: 'default',
};

function makeDeps() {
  const store = createRuntimeStore();
  const checkpointManager = createCheckpointManager({ store });
  const events = createRuntimeEvents({ store });
  const observability = createObservability({ store });
  return { store, checkpointManager, events, observability };
}

// ─── PB01 TikTok adapter ─────────────────────────────────────────────────────

test('PB01 tiktok adapter returns published url', async () => {
  const adapter = createTikTokAdapter();
  const result = await adapter.publish(STUB_ARTIFACT, { username: 'testuser' });
  assert.equal(result.platform, 'tiktok');
  assert.ok(result.published_url.includes('tiktok.com'));
  assert.ok(result.published_id);
  assert.equal(result.status, 'published');
});

// ─── PB02 YouTube adapter ─────────────────────────────────────────────────────

test('PB02 youtube adapter returns published url', async () => {
  const adapter = createYouTubeAdapter();
  const result = await adapter.publish(STUB_ARTIFACT, { title: 'Test Video' });
  assert.equal(result.platform, 'youtube');
  assert.ok(result.published_url.includes('youtu.be'));
  assert.ok(result.published_id);
  assert.equal(result.status, 'published');
});

// ─── PB03 Publish service multi-platform ────────────────────────────────────

test('PB03 publish service publishes to multiple platforms', async () => {
  const service = createPublishService();
  const res = await service.publish('job-pb03', STUB_ARTIFACT, ['tiktok', 'youtube'], {});
  assert.ok(res.publishId);
  assert.equal(res.results.length, 2);
  assert.ok(res.results.every((r) => r.status === 'published'));
  assert.ok(res.results.some((r) => r.platform === 'tiktok'));
  assert.ok(res.results.some((r) => r.platform === 'youtube'));
});

// ─── PB04 Draft manager ──────────────────────────────────────────────────────

test('PB04 draft manager save/get/list/delete', () => {
  const mgr = createDraftManager();
  const d = mgr.save({ jobId: 'job-pb04', artifact: STUB_ARTIFACT, platforms: ['tiktok'] });
  assert.ok(d.id);
  assert.equal(d.status, 'draft');

  const fetched = mgr.get(d.id);
  assert.equal(fetched.id, d.id);

  const updated = mgr.update(d.id, { options: { title: 'Updated' } });
  assert.equal(updated.options.title, 'Updated');

  const list = mgr.list({ jobId: 'job-pb04' });
  assert.equal(list.length, 1);

  const removed = mgr.remove(d.id);
  assert.equal(removed, true);
  assert.equal(mgr.get(d.id), null);
});

// ─── PB05 Scheduler creates and lists scheduled entries ──────────────────────

test('PB05 scheduler creates and cancels scheduled publish', () => {
  const scheduler = createScheduler(); // no publishService = fire stubs out
  const future = new Date(Date.now() + 60_000).toISOString();
  const entry = scheduler.schedule({
    jobId: 'job-pb05',
    artifact: STUB_ARTIFACT,
    platforms: ['facebook'],
    scheduledAt: future,
  });
  assert.ok(entry.id);
  assert.equal(entry.status, 'scheduled');
  assert.equal(scheduler.pendingCount(), 1);

  const cancelled = scheduler.cancel(entry.id);
  assert.equal(cancelled, true);
  assert.equal(scheduler.get(entry.id).status, 'cancelled');
  assert.equal(scheduler.pendingCount(), 0);
});

// ─── PB06 Publish queue ──────────────────────────────────────────────────────

test('PB06 publish queue executes inline and returns result', async () => {
  const service = createPublishService();
  const q = createPublishQueue({ publishService: service });

  const res = await q.enqueue({ jobId: 'job-pb06', artifact: STUB_ARTIFACT, platforms: ['instagram'] });
  assert.equal(res.queued, true);
  assert.ok(res.queueJobId);
  assert.ok(res.result?.results?.length >= 1);

  const status = q.getStatus(res.queueJobId);
  assert.equal(status.found, true);
  assert.equal(status.status, 'done');
});

// ─── PB07 Publish history ────────────────────────────────────────────────────

test('PB07 publish history records and queries events', async () => {
  const history = createPublishHistory();
  const service = createPublishService({ history });

  await service.publish('job-pb07', STUB_ARTIFACT, ['tiktok', 'facebook'], {});

  const records = history.list({ jobId: 'job-pb07' });
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.status === 'published'));

  const tiktokRecords = history.list({ platform: 'tiktok' });
  assert.ok(tiktokRecords.length >= 1);

  const stats = history.stats();
  assert.ok(stats.total >= 2);
  assert.ok(stats.byPlatform.tiktok?.published >= 1);
});

// ─── PB08 Webhook handler ────────────────────────────────────────────────────

test('PB08 webhook handler dispatches to registered handler', async () => {
  const handler = createWebhookHandler();
  let called = false;
  handler.register('tiktok', async (payload) => {
    called = true;
    assert.equal(payload.event, 'video.published');
  });

  const res = await handler.process('tiktok', { event: 'video.published', video_id: 'abc' });
  assert.equal(res.handled, true);
  assert.equal(called, true);

  const unhandled = await handler.process('youtube', { event: 'upload.complete' });
  assert.equal(unhandled.handled, false);

  const log = handler.listLog();
  assert.equal(log.length, 2);
});

// ─── PB09 publish node in pipeline creates checkpoint with URL ───────────────

test('PB09 publish node in pipeline creates checkpoint with published_url', async () => {
  const deps = makeDeps();
  const publishEngine = createPublishEngine({ history: createPublishHistory() });
  const template = getVideoPipelineTemplate();
  const executor = createPipelineExecutor({
    ...deps,
    mediaEngine: null,
    renderEngine: null,
    publishEngine,
  });
  const plan = { dag: template };
  const res = await executor.executePlan({ runtimeJobId: 'job-pb09', plan });

  const cps = deps.store._tables.workflowCheckpoints.filter(
    (c) => c.workflow_job_id === res.workflowJobId && c.node_id === 'publish',
  );
  assert.ok(cps.length >= 1);
  assert.ok(cps[cps.length - 1].payload?.published_url);
});

// ─── PB10 analytics event emitted after publish ──────────────────────────────

test('PB10 publish service emits analytics event after publish', async () => {
  const deps = makeDeps();
  const service = createPublishService({ events: deps.events });
  await service.publish('job-pb10', STUB_ARTIFACT, ['youtube'], {});

  const evts = await deps.events.listByJob('job-pb10');
  const publishEvt = evts.find((e) => e.name === 'aivos.publish.completed');
  assert.ok(publishEvt);
  assert.equal(publishEvt.payload?.jobId, 'job-pb10');
  assert.ok(publishEvt.payload?.success?.includes('youtube'));
});

// ─── PB11 artifact reuse – publish uses render artifact hash ─────────────────

test('PB11 artifact reuse – publish preserves render artifact hash', async () => {
  const history = createPublishHistory();
  const service = createPublishService({ history });
  const renderArtifact = { ...STUB_ARTIFACT, hash: 'render_hash_abc123', template: 'branded' };

  await service.publish('job-pb11', renderArtifact, ['tiktok'], {});

  const records = history.list({ jobId: 'job-pb11' });
  assert.equal(records.length, 1);
  assert.equal(records[0].renderMetadata?.hash, 'render_hash_abc123');
  assert.equal(records[0].renderMetadata?.template, 'branded');
});
