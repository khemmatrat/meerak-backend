/**
 * AI Director Phase 1–4 tests — orchestrator, UGC pipeline, validation, preview
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_BRIEF = '1';
process.env.AIVOS_MERCHANT_AD_IMAGE_GEN = '1';
process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '0';

const { createMerchantAdEngine } = await import('../lib/aivos/merchant-ad/index.js');
const { resolveGenerationMode, AD_FORMATS, GENERATION_ERRORS, GENERATION_STATES } = await import(
  '../lib/aivos/merchant-ad/director/index.js'
);
const { buildDirectorPlan } = await import('../lib/aivos/merchant-ad/director/orchestrator.js');
const { generateVideo, registerVideoProvider } = await import('../lib/aivos/merchant-ad/director/engines/videoEngine.js');

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('MAD12 director resolves generation modes', () => {
  assert.equal(
    resolveGenerationMode({ product_title: 'X', guide: { format: 'tvc_multi_shot' } }),
    AD_FORMATS.TVC,
  );
  assert.equal(
    resolveGenerationMode({ product_title: 'X', guide: { format: 'ugc_lipsync' } }),
    AD_FORMATS.UGC,
  );
  assert.equal(resolveGenerationMode({ product_title: 'X', category_id: 'food' }), AD_FORMATS.UGC);
  assert.equal(
    resolveGenerationMode({ product_title: 'X', style_id: 'luxury_brand', category_id: 'food' }),
    AD_FORMATS.TVC,
  );
});

test('MAD13 director plan builds structured director_plan with merchant preview', async () => {
  const engine = createMerchantAdEngine();
  const result = await engine.director.plan({
    merchant_id: 'demo-merchant',
    product_title: 'ข้าวมันไก่',
    category_id: 'food',
    price_thb: 89,
    promo_text: 'ลด 10%',
    portrait_image_url: tinyPng,
  });

  const { plan, preview, validation, cost_estimate } = result;
  assert.equal(plan.format, AD_FORMATS.UGC);
  assert.equal(plan.script.source, 'script_strategy_engine');
  assert.equal(plan.prompt.engine_version, '2.1.0');
  assert.ok(plan.prompt.video);
  assert.equal(plan.video_provider_id, 'ugc_grok');
  assert.ok(preview);
  assert.ok(preview.script.full_text);
  assert.ok(preview.prompt_summary.preview);
  assert.ok(preview.cost);
  assert.ok(validation);
  assert.ok(cost_estimate.aspect_ratio);
  assert.equal(cost_estimate.resolution, '720p');
});

test('MAD14 director health exposes phase 4 UGC implemented', () => {
  const engine = createMerchantAdEngine();
  const health = engine.health();
  assert.equal(health.features.director.phase, 4);
  assert.equal(health.features.director.ugc_implemented, true);
  assert.ok(health.features.director.provider_capabilities);
  assert.ok(health.features.director.generation_states.includes(GENERATION_STATES.VALIDATING));
});

test('MAD15 legacy generate() does not attach director_plan', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_MOCK_GROK = '1';

  const { spawnSync } = await import('child_process');
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    return;
  }

  const engine = createMerchantAdEngine();
  const merchantId = `mad-legacy-${Date.now()}`;
  const { brief } = await engine.createBrief({
    merchant_id: merchantId,
    product_title: 'Legacy TVC',
    category_style: 'skincare',
    mood: 'premium',
  });

  const { job } = await engine.generate({
    merchantId,
    ownerId: 'test',
    productTitle: 'Legacy TVC',
    productImageUrl: tinyPng,
    brief: { ...brief, shots: brief.shots.slice(0, 2) },
    guide: {},
  });

  assert.equal(job.director_plan, undefined);

  let done = job;
  for (let i = 0; i < 90; i++) {
    if (done.status === 'completed' || done.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 500));
    done = await engine.getJob({ jobId: job.id });
  }

  assert.equal(done.status, 'completed');
  assert.equal(done.director_plan, undefined);
});

test('MAD16 director TVC run uses tvc provider and completes', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_MOCK_GROK = '1';

  const { spawnSync } = await import('child_process');
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    return;
  }

  const engine = createMerchantAdEngine();
  const merchantId = `mad-dir-tvc-${Date.now()}`;
  const { job, plan } = await engine.director.run({
    merchant_id: merchantId,
    owner_id: 'test',
    product_title: 'Director TVC',
    product_image_url: tinyPng,
    format: 'tvc_multi_shot',
    category_id: 'skincare',
  });

  assert.equal(plan.format, AD_FORMATS.TVC);
  assert.equal(plan.video_provider_id, 'tvc_pipeline');
  assert.ok(job.director_plan);
  assert.ok(job.cost_estimate);

  let done = job;
  for (let i = 0; i < 90; i++) {
    if (done.status === 'completed' || done.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 500));
    done = await engine.getJob({ jobId: job.id });
  }

  assert.equal(done.status, 'completed');
  assert.equal(done.generation_state, GENERATION_STATES.COMPLETED);
});

test('MAD17 UGC validation fails before generate when reference image missing', async () => {
  const engine = createMerchantAdEngine();
  const merchantId = `mad-dir-ugc-val-${Date.now()}`;

  await assert.rejects(
    () =>
      engine.director.run({
        merchant_id: merchantId,
        product_title: 'UGC Test',
        format: 'ugc_lipsync',
        category_id: 'food',
      }),
    (err) => {
      assert.equal(err.code, GENERATION_ERRORS.VALIDATION_FAILED);
      assert.ok(err.details?.checks);
      return true;
    },
  );
});

test('MAD37 UGC mock generation completes with state machine', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_MOCK_UGC = '1';

  const { spawnSync } = await import('child_process');
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    return;
  }

  const engine = createMerchantAdEngine();
  const merchantId = `mad-dir-ugc-mock-${Date.now()}`;

  const { job, preview, cost_estimate } = await engine.director.run({
    merchant_id: merchantId,
    product_title: 'UGC Mock',
    portrait_image_url: tinyPng,
    format: 'ugc_lipsync',
    category_id: 'food',
  });

  assert.ok(preview.ready_to_generate);
  assert.equal(cost_estimate.aspect_ratio, '9:16');
  assert.ok(job.generation_timeline);

  let done = job;
  for (let i = 0; i < 60; i++) {
    if (done.status === 'completed' || done.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 300));
    done = await engine.getJob({ jobId: job.id });
  }

  assert.equal(done.status, 'completed');
  assert.equal(done.generation_state, GENERATION_STATES.COMPLETED);
  assert.ok(done.output_video_url);
  assert.match(done.video_engine, /ugc_lipsync/);
});

test('MAD38 plan preview exposes script prompt cost without side effects', async () => {
  const engine = createMerchantAdEngine();
  const { preview } = await engine.director.plan({
    merchant_id: 'demo-merchant',
    product_title: 'ส้มตำ',
    portrait_image_url: tinyPng,
    category_id: 'food',
    price_thb: 79,
  });

  assert.ok(preview.script.full_text);
  assert.ok(preview.prompt_summary.preview);
  assert.equal(preview.duration.clip_sec, 10);
  assert.ok(preview.cost.video_generation);
  assert.equal(preview.style.id, 'restaurant_owner');
});

test('MAD18 video engine supports provider registration extension point', async () => {
  let called = false;
  registerVideoProvider({
    id: 'mock_future_veo',
    supports: (format) => format === 'ugc_lipsync',
    async generate(ctx) {
      called = true;
      ctx.job.status = 'completed';
      ctx.job.video_engine = 'mock_veo';
      return { job: ctx.job, provider_id: 'mock_future_veo' };
    },
  });

  const plan = buildDirectorPlan({
    merchant_id: 'demo',
    product_title: 'Test',
    format: 'ugc_lipsync',
    portrait_image_url: tinyPng,
  });

  const job = { id: 'mad-mock', status: 'generating', product_title: 'Test' };
  const result = await generateVideo({
    format: 'ugc_lipsync',
    job,
    outDir: '/tmp',
    plan,
    request: { product_title: 'Test', merchant_id: 'demo', portrait_image_url: tinyPng },
  });

  assert.equal(called, true);
  assert.equal(result.provider_id, 'mock_future_veo');
});
