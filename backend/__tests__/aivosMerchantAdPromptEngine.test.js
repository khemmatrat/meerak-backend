/**
 * AI Director Phase 2 — Prompt Composition Engine tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_ENABLED = '1';

const {
  buildPromptComposeInput,
  composePromptFromDimensions,
  composePromptWithScript,
  getPromptEngineInfo,
  composePrompt,
  AD_FORMATS,
  listPromptVersions,
} = await import('../lib/aivos/merchant-ad/director/index.js');

test('MAD19 prompt engine exposes versioned catalog info', () => {
  const info = getPromptEngineInfo();
  assert.equal(info.engine, 'prompt_composition_engine');
  assert.equal(info.engine_version, '2.1.0');
  assert.equal(info.catalog_version, '3.0.0');
  assert.equal(info.prompt_version, 'v3');
  assert.equal(info.active_prompt_version, 'v3');

  const versions = listPromptVersions();
  assert.ok(versions.some((v) => v.id === 'v1'));
  assert.ok(versions.some((v) => v.id === 'v3' && v.active));
});

test('MAD20 UGC prompt composes from all dimensions', () => {
  const input = buildPromptComposeInput(
    {
      product_title: 'ข้าวมันไก่พิเศษ',
      merchant_name: 'ร้านลุงแดง',
      price_thb: 89,
      promo_text: 'ลด 10%',
      target_audience: 'office',
      guide: { campaign_goal: 'discount', platform: 'mobile_feed', cta_id: 'order_now' },
    },
    {
      format: AD_FORMATS.UGC,
      style_id: 'restaurant_owner',
      category_id: 'food',
    },
  );

  assert.equal(input.business_type, 'food_shop');
  assert.equal(input.industry_id, 'food');
  assert.equal(input.campaign_goal, 'discount');
  assert.equal(input.prompt_version, 'v3');

  const composed = composePromptFromDimensions(input);
  assert.equal(composed.source, 'prompt_composition_engine');
  assert.equal(composed.catalog_version, '3.0.0');
  assert.equal(composed.prompt_version, 'v3');
  assert.ok(composed.video);
  assert.ok(composed.video.includes('ข้าวมันไก่พิเศษ'));
  assert.ok(composed.video.includes('89'));
  assert.ok(composed.video.includes('ลด 10%'));
  assert.ok(composed.fragments_used.includes('scene'));
  assert.ok(composed.fragments_used.includes('motion'));
  assert.ok(composed.fragments_used.includes('spoken'));
  assert.ok(composed.fragments_used.includes('provider_wrap'));
  assert.ok(composed.reproducibility_hash);
  assert.equal(composed.dimensions.industry_id, 'food');
  assert.equal(composed.dimensions.style_preset, 'restaurant_owner');
});

test('MAD21 reproducibility hash is stable for same inputs', () => {
  const base = {
    format: AD_FORMATS.UGC,
    product_title: 'Test Product',
    merchant_name: 'Shop',
    business_type: 'marketplace',
    industry_id: 'general',
    target_audience: 'all',
    style_id: 'friendly_seller',
    campaign_goal: 'quality',
    language: 'th',
    platform: 'mobile_feed',
    price_thb: 100,
    promo_text: null,
    cta_id: 'order_now',
    cta_intensity: 'soft',
    ai_provider: 'grok',
    prompt_version: 'v3',
    spoken_text: null,
  };
  const a = composePromptFromDimensions(base);
  const b = composePromptFromDimensions(base);
  assert.equal(a.reproducibility_hash, b.reproducibility_hash);
});

test('MAD22 TVC format skips video prompt composition', () => {
  const composed = composePromptFromDimensions({
    format: AD_FORMATS.TVC,
    product_title: 'Premium Serum',
    merchant_name: 'Shop',
    business_type: 'marketplace',
    industry_id: 'skincare',
    target_audience: 'women',
    style_id: 'luxury_brand',
    campaign_goal: 'quality',
    language: 'th',
    platform: 'mobile_feed',
    cta_id: '_default',
    cta_intensity: 'soft',
    ai_provider: 'grok',
    prompt_version: 'v3',
    spoken_text: null,
  });

  assert.equal(composed.skipped, true);
  assert.equal(composed.reason, 'tvc_uses_brief_engine');
  assert.equal(composed.video, null);
});

test('MAD23 composePromptWithScript integrates spoken text from Script Engine', () => {
  const input = buildPromptComposeInput(
    { product_title: 'ครีมกันแดด', merchant_name: 'Beauty Shop', price_thb: 299 },
    { format: AD_FORMATS.UGC, style_id: 'beauty_influencer', category_id: 'beauty' },
  );

  const withScript = composePromptWithScript(input, {
    full_text_th: 'สวัสดีค่ะ ครีมกันแดดตัวนี้ดีมาก สั่งเลยค่ะ',
  });

  assert.ok(withScript.video.includes('ครีมกันแดดตัวนี้ดีมาก'));
  assert.equal(withScript.spoken_text_slot, 'สวัสดีค่ะ ครีมกันแดดตัวนี้ดีมาก สั่งเลยค่ะ');
});

test('MAD24 English language and provider dimension apply without hardcoding in orchestrator', () => {
  const composed = composePromptFromDimensions({
    format: AD_FORMATS.UGC,
    product_title: 'Organic Honey',
    merchant_name: 'Farm Shop',
    business_type: 'marketplace',
    industry_id: 'general',
    target_audience: 'all',
    style_id: 'friendly_seller',
    campaign_goal: 'awareness',
    language: 'en',
    platform: 'youtube_shorts',
    cta_id: 'order_now',
    cta_intensity: 'soft',
    ai_provider: 'veo',
    prompt_version: 'v3',
    price_thb: null,
    promo_text: null,
    spoken_text: null,
  });

  assert.ok(composed.video.includes('Speak clearly in natural English'));
  assert.ok(composed.video.includes('YouTube Shorts') || composed.video.includes('9:16'));
  assert.ok(composed.video.includes('Cinematic product video generation'));
  assert.equal(composed.dimensions.ai_provider, 'veo');
  assert.ok(composed.dimension_versions.providers);
});

test('MAD25 director plan uses prompt composition engine in Phase 2', async () => {
  const { createMerchantAdEngine } = await import('../lib/aivos/merchant-ad/index.js');
  const engine = createMerchantAdEngine();
  const { plan } = await engine.director.plan({
    merchant_id: 'demo-merchant',
    product_title: 'ข้าวมันไก่',
    category_id: 'food',
    price_thb: 89,
  });

  assert.equal(plan.prompt.source, 'prompt_composition_engine');
  assert.equal(plan.prompt.engine_version, '2.1.0');
  assert.equal(plan.prompt.prompt_version, 'v3');
  assert.ok(plan.prompt.video);
  assert.equal(plan.script.source, 'script_strategy_engine');
  assert.equal(engine.health().features.director.phase, 4);
  assert.ok(engine.health().features.director.prompt_engine);
});

test('MAD33 restaurant UGC TikTok Thai promotion soft CTA composes without code change', () => {
  const composed = composePromptFromDimensions({
    format: AD_FORMATS.UGC,
    product_title: 'ข้าวมันไก่พิเศษ',
    merchant_name: 'ร้านลุงแดง',
    business_type: 'food_shop',
    industry_id: 'restaurant',
    target_audience: 'all',
    style_id: 'ugc',
    campaign_goal: 'promotion',
    language: 'th',
    platform: 'tiktok',
    cta_id: 'order_now',
    cta_intensity: 'soft',
    ai_provider: 'grok',
    prompt_version: 'v3',
    price_thb: 89,
    promo_text: 'ลด 10%',
    spoken_text: null,
  });

  assert.equal(composed.dimensions.industry_id, 'restaurant');
  assert.equal(composed.dimensions.style_preset, 'ugc');
  assert.equal(composed.dimensions.platform, 'tiktok');
  assert.equal(composed.dimensions.cta_intensity, 'soft');
  assert.ok(composed.video.includes('TikTok') || composed.video.includes('fast hook'));
  assert.ok(composed.video.includes('ลองดูได้นะคะ') || composed.video.includes('ไม่กดก็ไม่เป็นไร'));
  assert.ok(composed.video.includes('UGC image-to-video'));
});

test('MAD34 restaurant luxury Facebook English brand awareness hard CTA', () => {
  const composed = composePromptFromDimensions({
    format: AD_FORMATS.UGC,
    product_title: 'Signature Roast Chicken',
    merchant_name: 'Red Uncle Kitchen',
    business_type: 'food_shop',
    industry_id: 'restaurant',
    target_audience: 'all',
    style_id: 'luxury',
    campaign_goal: 'brand_awareness',
    language: 'en',
    platform: 'facebook',
    cta_id: 'order_now',
    cta_intensity: 'hard',
    ai_provider: 'veo',
    prompt_version: 'v3',
    price_thb: null,
    promo_text: null,
    spoken_text: null,
  });

  assert.equal(composed.dimensions.style_preset, 'luxury');
  assert.equal(composed.dimensions.campaign_goal, 'brand_awareness');
  assert.equal(composed.dimensions.language, 'en');
  assert.equal(composed.dimensions.platform, 'facebook');
  assert.equal(composed.dimensions.cta_intensity, 'hard');
  assert.ok(composed.video.includes('Facebook') || composed.video.includes('social feed'));
  assert.ok(composed.video.includes('Order now before the offer ends'));
  assert.ok(composed.video.includes('Cinematic product video'));
});

test('MAD35 prompt version pinning allows v1 replay after active upgrades to v3', () => {
  const dims = {
    format: AD_FORMATS.UGC,
    product_title: 'ข้าวมันไก่',
    merchant_name: 'ร้านทดสอบ',
    business_type: 'food_shop',
    industry_id: 'restaurant',
    target_audience: 'all',
    style_id: 'ugc',
    campaign_goal: 'promotion',
    language: 'th',
    platform: 'tiktok',
    cta_id: 'order_now',
    cta_intensity: 'soft',
    ai_provider: 'generic',
    price_thb: 79,
    promo_text: null,
    spoken_text: null,
  };

  const v1a = composePromptFromDimensions({ ...dims, prompt_version: 'v1' });
  const v1b = composePromptFromDimensions({ ...dims, prompt_version: 'v1' });
  const v3 = composePromptFromDimensions({ ...dims, prompt_version: 'v3' });

  assert.equal(v1a.prompt_version, 'v1');
  assert.equal(v1a.catalog_version, '1.0.0');
  assert.equal(v1a.reproducibility_hash, v1b.reproducibility_hash);
  assert.notEqual(v1a.reproducibility_hash, v3.reproducibility_hash);
  assert.notEqual(v1a.video, v3.video);
});

test('MAD36 Japanese and Chinese language libraries load from prompt-library', () => {
  const ja = composePromptFromDimensions({
    format: AD_FORMATS.UGC,
    product_title: '抹茶ラテ',
    merchant_name: 'カフェ',
    business_type: 'food_shop',
    industry_id: 'restaurant',
    target_audience: 'all',
    style_id: 'ugc',
    campaign_goal: 'promotion',
    language: 'ja',
    platform: 'tiktok',
    cta_id: '_default',
    cta_intensity: 'soft',
    ai_provider: 'kling',
    prompt_version: 'v3',
    price_thb: null,
    promo_text: null,
    spoken_text: null,
  });

  const zh = composePromptFromDimensions({
    format: AD_FORMATS.UGC,
    product_title: '珍珠奶茶',
    merchant_name: '茶饮店',
    business_type: 'food_shop',
    industry_id: 'restaurant',
    target_audience: 'all',
    style_id: 'ugc',
    campaign_goal: 'promotion',
    language: 'zh',
    platform: 'tiktok',
    cta_id: '_default',
    cta_intensity: 'soft',
    ai_provider: 'runway',
    prompt_version: 'v3',
    price_thb: null,
    promo_text: null,
    spoken_text: null,
  });

  assert.ok(ja.video.includes('日本語'));
  assert.ok(zh.video.includes('中文'));
  assert.ok(ja.video.includes('Kling') || ja.video.includes('Natural human motion'));
  assert.ok(zh.video.includes('Runway') || zh.video.includes('High-fidelity'));
});
