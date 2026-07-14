/**
 * AI Director Phase 3 — Script Strategy Engine tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_RUNTIME_ENABLED = '1';
process.env.AIVOS_MERCHANT_AD_ENABLED = '1';

const {
  resolveBusinessContext,
  resolveMarketingStrategy,
  resolveEmotionalStrategy,
  generateScript,
  composeScript,
  getScriptEngineInfo,
  AD_FORMATS,
} = await import('../lib/aivos/merchant-ad/director/index.js');

test('MAD26 script engine exposes versioned catalog', () => {
  const info = getScriptEngineInfo();
  assert.equal(info.engine, 'script_strategy_engine');
  assert.equal(info.engine_version, '3.0.0');
  assert.ok(info.script_types.includes('ugc'));
  assert.ok(info.script_types.includes('testimonial'));
});

test('MAD27 food industry selects memory + happiness strategies', () => {
  const ctx = resolveBusinessContext(
    { product_title: 'ข้าวมันไก่', merchant_name: 'ร้านลุงแดง' },
    { category_id: 'food', format: AD_FORMATS.UGC },
  );
  const strategy = resolveMarketingStrategy(ctx);
  assert.equal(strategy.primary_id, 'sell_memory');
  assert.equal(strategy.secondary_id, 'sell_happiness');
  assert.equal(strategy.primary.label_th, 'ขายความทรงจำ');
});

test('MAD28 beauty industry selects confidence + beauty strategies', () => {
  const ctx = resolveBusinessContext(
    { product_title: 'ครีมกันแดด' },
    { category_id: 'beauty', format: AD_FORMATS.UGC },
  );
  const strategy = resolveMarketingStrategy(ctx);
  assert.equal(strategy.primary_id, 'sell_confidence');
  assert.equal(strategy.secondary_id, 'sell_beauty');
});

test('MAD29 marketplace selects time + value strategies', () => {
  const ctx = resolveBusinessContext(
    { product_title: 'สินค้าออนไลน์' },
    { category_id: 'marketplace', format: AD_FORMATS.UGC },
  );
  const strategy = resolveMarketingStrategy(ctx);
  assert.equal(strategy.primary_id, 'sell_time');
  assert.equal(strategy.secondary_id, 'sell_value');
});

test('MAD30 script layers follow Business→Strategy→Emotion→Hook pipeline', () => {
  const ctx = resolveBusinessContext(
    { product_title: 'ข้าวมันไก่พิเศษ', merchant_name: 'ร้านแม่', price_thb: 89, promo_text: 'ลด 10%' },
    { category_id: 'food', format: AD_FORMATS.UGC },
  );
  const strategy = resolveMarketingStrategy(ctx);
  const emotion = resolveEmotionalStrategy(strategy);
  const script = composeScript({ businessContext: ctx, marketingStrategy: strategy, emotionalStrategy: emotion });

  assert.equal(script.source, 'script_strategy_engine');
  assert.ok(script.layers.business);
  assert.ok(script.layers.strategy);
  assert.ok(script.layers.emotion);
  assert.ok(script.layers.hook);
  assert.ok(script.layers.pain);
  assert.ok(script.layers.solution);
  assert.ok(script.layers.cta);
  assert.ok(script.full_text_th.includes('ข้าวมันไก่พิเศษ'));
  assert.ok(script.full_text_th.includes('89'));
  assert.ok(script.reproducibility_hash);
  assert.equal(script.script_type, 'ugc');
});

test('MAD31 multiple script types compose different structures', () => {
  const base = {
    product_title: 'สินค้าทดสอบ',
    merchant_name: 'ร้านทดสอบ',
    price_thb: 199,
  };
  const ctxUgc = resolveBusinessContext(base, { category_id: 'general', format: AD_FORMATS.UGC });
  const ctxStory = resolveBusinessContext(
    { ...base, guide: { script_type: 'story' } },
    { category_id: 'general', format: AD_FORMATS.UGC },
  );

  const scriptUgc = generateScript(base, { category_id: 'general', format: AD_FORMATS.UGC, style_id: 'friendly_seller' });
  const scriptStory = generateScript(
    { ...base, guide: { script_type: 'story' } },
    { category_id: 'general', format: AD_FORMATS.UGC, style_id: 'friendly_seller' },
  );

  assert.equal(scriptUgc.script_type, 'ugc');
  assert.equal(scriptStory.script_type, 'story');
  assert.ok(scriptUgc.layers.strategy);
  assert.equal(scriptStory.layers.strategy, undefined);
});

test('MAD32 director plan integrates script into prompt spoken text', async () => {
  const { createMerchantAdEngine } = await import('../lib/aivos/merchant-ad/index.js');
  const engine = createMerchantAdEngine();
  const { plan } = await engine.director.plan({
    merchant_id: 'demo-merchant',
    product_title: 'ข้าวมันไก่',
    merchant_name: 'ร้านทดสอบ',
    category_id: 'food',
    price_thb: 89,
  });

  assert.equal(plan.script.source, 'script_strategy_engine');
  assert.equal(plan.script.marketing_strategy.primary_id, 'sell_memory');
  assert.ok(plan.script.full_text_th);
  assert.ok(plan.prompt.video.includes(plan.script.full_text_th.slice(0, 20).split(' ')[0]));
  assert.equal(plan.prompt.spoken_text_slot, plan.script.full_text_th);
  assert.equal(engine.health().features.director.phase, 4);
  assert.ok(engine.health().features.director.script_engine);
});
