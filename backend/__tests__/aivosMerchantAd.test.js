/**
 * AIVOS Merchant Ad module tests — Phase 21 extension (MAD01+)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_BRIEF = '1';
process.env.AIVOS_MERCHANT_AD_IMAGE_GEN = '1';
process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '0';
process.env.AIVOS_MERCHANT_AD_WEEKLY_LIMIT = '3';

const { createMerchantAdEngine, isMerchantAdEnabled, MERCHANT_AD_PHASE } = await import(
  '../lib/aivos/merchant-ad/index.js'
);
const { ruleBasedBrief } = await import('../lib/aivos/merchant-ad/briefEngine.js');

test('MAD01 module enabled and phase 21', () => {
  assert.equal(isMerchantAdEnabled(), true);
  assert.equal(MERCHANT_AD_PHASE, 21);
  const engine = createMerchantAdEngine();
  assert.equal(engine.enabled, true);
  assert.equal(engine.health().ok, true);
});

test('MAD02 brief produces 10 shots', () => {
  const brief = ruleBasedBrief({
    product_title: 'MS GLOW Facial Wash',
    mood: 'premium',
    category_style: 'skincare',
    hook: 'quality',
  });
  assert.equal(brief.shots.length, 10);
  assert.ok(brief.shots[0].image_prompt.includes('MS GLOW'));
});

test('MAD03 quota limits 3 per week', async () => {
  const engine = createMerchantAdEngine();
  const merchantId = `mad-test-${Date.now()}`;
  const q1 = await engine.quota({ merchantId });
  assert.equal(q1.limit, 3);
  assert.equal(q1.remaining, 3);
});

test('MAD04 food merchant allowed marketplace allowed', async () => {
  const engine = createMerchantAdEngine();
  await assert.doesNotReject(() => engine.quota({ merchantId: 'food-thai-1' }));
  await assert.doesNotReject(() => engine.quota({ merchantId: 'demo-merchant' }));
});

test('MAD05 brief via engine', async () => {
  const engine = createMerchantAdEngine();
  const { brief } = await engine.createBrief({
    merchant_id: 'demo-merchant',
    product_title: 'Test Product',
    category_style: 'food',
    mood: 'energetic',
  });
  assert.ok(brief.shots.length >= 8);
});

test('MAD06 health reports grok video sprint 4 flags', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_GROK_VIDEO = '1';
  process.env.AIVOS_MERCHANT_AD_GROK_MAX_SHOTS = '3';
  process.env.AIVOS_MERCHANT_AD_MOCK_GROK = '1';

  const { isGrokVideoEnabled, grokMaxShots } = await import('../lib/aivos/merchant-ad/config.js');
  const engine = createMerchantAdEngine();
  const health = engine.health();

  assert.equal(isGrokVideoEnabled(), true);
  assert.equal(grokMaxShots(), 3);
  assert.equal(health.features.grok_video, true);
  assert.equal(health.features.grok_max_shots, 3);
});

test('MAD07 grok bridge respects max shots and mock mode', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_GROK_VIDEO = '1';
  process.env.AIVOS_MERCHANT_AD_GROK_MAX_SHOTS = '2';
  process.env.AIVOS_MERCHANT_AD_MOCK_GROK = '1';

  const { shouldUseGrokForShot, hasGrokCredentials } = await import(
    '../lib/aivos/merchant-ad/grokVideoBridge.js'
  );

  assert.equal(hasGrokCredentials(), false);
  assert.equal(shouldUseGrokForShot(0), false);
  assert.equal(shouldUseGrokForShot(1), false);
});

test('MAD08 ken burns pipeline completes without grok key', async () => {
  process.env.AIVOS_MERCHANT_AD_VIDEO_GEN = '1';
  process.env.AIVOS_MERCHANT_AD_GROK_VIDEO = '1';
  process.env.AIVOS_MERCHANT_AD_MOCK_GROK = '1';

  const { spawnSync } = await import('child_process');
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    return;
  }

  const engine = createMerchantAdEngine();
  const merchantId = `mad-pipe-${Date.now()}`;
  const { brief } = await engine.createBrief({
    merchant_id: merchantId,
    product_title: 'Pipeline Test',
    category_style: 'skincare',
    mood: 'premium',
  });

  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const { job } = await engine.generate({
    merchantId,
    ownerId: 'test',
    productId: 'p1',
    productTitle: 'Pipeline Test',
    productImageUrl: tinyPng,
    brief: { ...brief, shots: brief.shots.slice(0, 2) },
    guide: {},
  });

  let done = job;
  for (let i = 0; i < 90; i++) {
    if (done.status === 'completed' || done.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 500));
    done = await engine.getJob({ jobId: job.id });
  }

  assert.equal(done.status, 'completed');
  assert.ok(done.output_video_url);
  assert.equal(done.video_engine, 'kenburns');
  assert.equal(done.shot_engines?.length, 2);
  assert.ok(done.shot_engines.every((e) => e === 'kenburns'));
});

test('MAD09 publish disabled when flag off', async () => {
  process.env.AIVOS_MERCHANT_AD_PUBLISH = '0';
  const { publishMerchantAd } = await import('../lib/aivos/merchant-ad/publishBridge.js');
  const result = await publishMerchantAd(
    { id: 'mad-test', status: 'completed', output_video_url: '/x.mp4', merchant_id: 'demo-merchant' },
    { target: 'studio_feed' },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'aivos_merchant_ad_publish_disabled');
});

test('MAD10 publish persists studio_result on job', async () => {
  process.env.AIVOS_MERCHANT_AD_PUBLISH = '1';
  const engine = createMerchantAdEngine();
  const merchantId = `mad-pub-${Date.now()}`;
  const { brief } = await engine.createBrief({
    merchant_id: merchantId,
    product_title: 'Publish Test',
    category_style: 'food',
    mood: 'premium',
  });

  const job = (
    await import('../lib/aivos/merchant-ad/merchantAdStorage.js')
  ).createJob({
    merchant_id: merchantId,
    owner_id: 'test',
    shop_type: 'food',
    product_id: 'prod-1',
    product_title: 'Publish Test',
    brief,
    guide: {},
  });
  job.status = 'completed';
  job.output_video_url = '/api/aivos/merchant-ad/files/test/output.mp4';
  await (await import('../lib/aivos/merchant-ad/merchantAdStorage.js')).saveJob(job);

  const result = await engine.publish({
    jobId: job.id,
    target: 'studio_feed',
    studioResult: {
      target: 'studio_feed',
      post_id: 'post-test-123',
      media_id: 'med-test-456',
      synced_feed: false,
      mode: 'local',
      playback_url: '/api/studio/media/med-test-456',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.published, true);
  assert.equal(result.publish.post_id, 'post-test-123');

  const saved = await engine.getJob({ jobId: job.id });
  assert.equal(saved.status, 'published');
  assert.equal(saved.publish.media_id, 'med-test-456');
});

test('MAD11 token topup and extended quota', async () => {
  process.env.AIVOS_MERCHANT_AD_PUBLISH = '1';
  const engine = createMerchantAdEngine();
  const merchantId = `mad-tok-${Date.now()}`;

  const q0 = await engine.quota({ merchantId });
  assert.equal(q0.tokens, 0);
  assert.equal(q0.tokens_per_video, 100);

  const top = await engine.topUp({ merchantId, packageId: 'p99' });
  assert.equal(top.tokens_added, 100);
  assert.equal(top.balance, 100);

  const q1 = await engine.quota({ merchantId });
  assert.equal(q1.tokens, 100);
  assert.equal(q1.token_videos_available, 1);
  assert.equal(q1.can_generate, true);
});
