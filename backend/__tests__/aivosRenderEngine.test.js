import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRenderEngine,
  createTemplateEngine,
  createCaptionEngine,
  createMotionEngine,
  createThumbnailEngine,
  createArtifactManager,
  createRenderQueue,
  createRenderService,
} from '../lib/aivos/render/index.js';
import { createPipelineExecutor } from '../lib/aivos/pipeline/executionGraph.js';
import { getVideoPipelineTemplate } from '../lib/aivos/pipeline/templates/videoPipelineV1.js';
import { createRuntimeStore } from '../lib/aivos/runtime/runtimeStore.js';
import { createCheckpointManager } from '../lib/aivos/runtime/checkpointManager.js';
import { createRuntimeEvents } from '../lib/aivos/runtime/runtimeEvents.js';
import { createObservability } from '../lib/aivos/runtime/observability.js';

process.env.AIVOS_RENDER_ENABLED = '1';

function makeDeps() {
  const store = createRuntimeStore();
  const checkpointManager = createCheckpointManager({ store });
  const events = createRuntimeEvents({ store });
  const observability = createObservability({ store });
  const renderEngine = createRenderEngine();
  return { store, checkpointManager, events, observability, renderEngine };
}

function countCheckpoints(store, wfId, nodeId) {
  return store._tables.workflowCheckpoints.filter((c) => c.workflow_job_id === wfId && (!nodeId || c.node_id === nodeId));
}

test('RE01 render engine returns artifact with thumbnail', async () => {
  const renderEngine = createRenderEngine();
  const res = await renderEngine.handle('render', { jobId: 'job-re01' });
  assert.ok(res.artifact?.uri);
  assert.ok(res.artifact?.thumbnail);
});

test('RE02 render node checkpoints include artifact', async () => {
  const deps = makeDeps();
  const template = getVideoPipelineTemplate();
  const executor = createPipelineExecutor({ ...deps, mediaEngine: null, renderEngine: deps.renderEngine });
  const plan = { dag: template };
  const res = await executor.executePlan({ runtimeJobId: 'job-re02', plan });
  const cps = countCheckpoints(deps.store, res.workflowJobId, 'render');
  assert.ok(cps.length >= 1);
  assert.ok(cps[cps.length - 1].payload?.artifact?.uri);
});

test('RE03 resume keeps render artifact checkpoint', async () => {
  const deps = makeDeps();
  const template = getVideoPipelineTemplate();
  const executor = createPipelineExecutor({ ...deps, mediaEngine: null, renderEngine: deps.renderEngine });
  const plan = { dag: template };
  const first = await executor.executePlan({ runtimeJobId: 'job-re03', plan });
  const before = countCheckpoints(deps.store, first.workflowJobId, 'render').length;
  const resumed = await executor.resumeFromLastCheckpoint({ runtimeJobId: 'job-re03', plan });
  const after = countCheckpoints(deps.store, resumed.workflowJobId, 'render').length;
  assert.ok(after >= before);
});

// ─── RE04 Template Engine ────────────────────────────────────────────────────

test('RE04 template engine resolves layout and produces ffmpeg args', () => {
  const engine = createTemplateEngine();
  const tpl = engine.resolve('vertical');
  assert.equal(tpl.aspectRatio, '9:16');
  assert.equal(tpl.width, 1080);
  assert.equal(tpl.height, 1920);

  const ctx = engine.apply('branded', {});
  assert.ok(ctx.template.intro === true);
  assert.ok(Array.isArray(ctx.ffmpegArgs));
  assert.ok(ctx.ffmpegArgs.length > 0);

  const all = engine.list();
  assert.ok(all.length >= 4);
});

// ─── RE05 Caption Engine ─────────────────────────────────────────────────────

test('RE05 caption engine generates SRT and ffmpeg args', () => {
  const engine = createCaptionEngine();
  const segments = [
    { start: 0, end: 3, text: 'Hello world' },
    { start: 3, end: 6, text: 'AI-powered captions' },
  ];
  const result = engine.generate(segments);
  assert.ok(result.srtPath);
  assert.ok(result.srt.includes('Hello world'));
  assert.equal(result.count, 2);

  const args = engine.ffmpegArgs(result.srtPath);
  assert.ok(args.includes('-vf'));
  assert.ok(args.some((a) => a.includes('subtitles')));
});

// ─── RE06 Motion Engine ───────────────────────────────────────────────────────

test('RE06 motion engine returns ffmpeg args for known effects', () => {
  const engine = createMotionEngine();
  const effects = engine.list();
  assert.ok(effects.includes('zoom'));
  assert.ok(effects.includes('kenburns'));
  assert.ok(effects.includes('fade'));

  const zoom = engine.apply('zoom', { scale: 1.1 });
  assert.equal(zoom.effect, 'zoom');
  assert.ok(zoom.filters.length > 0);
  assert.ok(zoom.ffmpegArgs.includes('-vf'));

  const none = engine.apply('nonexistent');
  assert.equal(none.effect, 'none');
  assert.deepEqual(none.ffmpegArgs, []);
});

// ─── RE07 Thumbnail Engine ────────────────────────────────────────────────────

test('RE07 ai thumbnail engine generates thumbnail with score', async () => {
  const engine = createThumbnailEngine();
  const result = await engine.generate('/dev/null', {});
  assert.ok(result.path);
  assert.ok(result.uri.startsWith('file://'));
  assert.ok(typeof result.score === 'number');
  assert.ok(result.score >= 0 && result.score <= 1);
  assert.equal(result.ai_generated, false);

  const { args, outputPath } = engine.extractFrameArgs('/path/to/video.mp4', 2);
  assert.ok(args.includes('-ss'));
  assert.ok(outputPath.endsWith('.jpg'));
});

// ─── RE08 Artifact Manager ───────────────────────────────────────────────────

test('RE08 artifact manager stores artifact with hash and version', async () => {
  const manager = createArtifactManager();
  const data = 'stub video content for test RE08';
  const meta = await manager.store('render/job-re08/video', data, { ext: 'mp4', version: '1.0.0' });
  assert.ok(meta.hash);
  assert.equal(meta.hash.length, 64); // sha256 hex
  assert.equal(meta.version, '1.0.0');
  assert.ok(meta.uri.startsWith('file://'));
  assert.equal(meta.uploaded, false); // no S3 in test env

  // SHA256 is deterministic for same data
  const hash2 = manager.sha256(data);
  assert.equal(meta.hash, hash2);
});

// ─── RE09 Render Queue ────────────────────────────────────────────────────────

test('RE09 render queue executes job inline and returns result', async () => {
  process.env.AIVOS_RENDER_ENABLED = '1';
  const service = createRenderService();
  const q = createRenderQueue({ renderService: service });

  const res = await q.enqueue('job-re09', {});
  assert.equal(res.queued, true);
  assert.ok(res.queueJobId);
  assert.ok(res.result?.artifact?.uri);

  const status = q.getStatus(res.queueJobId);
  assert.equal(status.found, true);
  assert.equal(status.status, 'done');

  const all = q.list();
  assert.equal(all.length, 1);
});
