#!/usr/bin/env node
/**
 * CLI for storefront local Director fallback when backend process is stale.
 * Usage: node scripts/director-cli.mjs plan '<json>'
 */
import { createMerchantAdEngine } from '../lib/aivos/merchant-ad/index.js';

const cmd = process.argv[2];
const raw = process.argv[3] || '{}';

process.env.AIVOS_RUNTIME_ENABLED = process.env.AIVOS_RUNTIME_ENABLED || '1';
process.env.AIVOS_MERCHANT_AD_ENABLED = process.env.AIVOS_MERCHANT_AD_ENABLED || '1';
process.env.AIVOS_MERCHANT_AD_BRIEF = process.env.AIVOS_MERCHANT_AD_BRIEF || '1';
process.env.AIVOS_MERCHANT_AD_MOCK_UGC =
  process.env.AIVOS_MERCHANT_AD_MOCK_UGC || process.env.AIVOS_MERCHANT_AD_MOCK_GROK || '1';

async function main() {
  const body = JSON.parse(raw);
  const engine = createMerchantAdEngine();
  if (!engine.enabled) {
    console.error(JSON.stringify({ error: 'merchant_ad_disabled' }));
    process.exit(1);
  }
  const request = {
    merchant_id: body.merchant_id,
    owner_id: body.owner_id,
    product_id: body.product_id,
    product_title: body.product_title,
    product_image_url: body.product_image_url,
    portrait_image_url: body.portrait_image_url,
    guide: body.guide,
    format: body.format,
    style_id: body.style_id,
    category_id: body.category_id,
    merchant_name: body.merchant_name,
  };
  if (cmd === 'plan') {
    const result = await engine.director.plan(request);
    console.log(JSON.stringify(result));
    return;
  }
  if (cmd === 'run') {
    const result = await engine.director.run(request);
    console.log(JSON.stringify(result));
    return;
  }
  console.error(JSON.stringify({ error: 'usage', hint: 'plan|run' }));
  process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.code || e.message, details: e.details }));
  process.exit(1);
});
