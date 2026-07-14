/**
 * Shop AI Search flow — Steps 1–4 smoke test (no payment/QR).
 * Run: node scripts/shop-ai-search-flow.test.mjs
 * Requires storefront dev server on PORT (default 3000).
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3000';
const USER = 'line:test-shop-ai-001';

async function post(body) {
  const res = await fetch(`${BASE}/api/shop/ai-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line_user_id: USER, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  const tests = [];

  const search = await post({ message: 'น้ำยาล้างจาน' });
  tests.push(['step1_search', search.ok && search.step === 'search']);
  tests.push(['step1_has_flex', Array.isArray(search.line?.messages) && search.line.messages.some((m) => m.type === 'flex')]);

  const cheapest = await post({ message: 'ที่ถูกที่สุด' });
  tests.push(['step2_refine', cheapest.ok && cheapest.step === 'refine']);

  const productId = cheapest.session?.selected_product_id || search.session?.last_search?.[0]?.id;
  if (!productId) throw new Error('no product id for select test');

  const select = await post({ postback_data: `action=select&product_id=${encodeURIComponent(productId)}` });
  tests.push(['step3_qty_prompt', select.ok && select.step === 'qty']);
  tests.push(['step3_quick_reply', Boolean(select.line?.quickReply?.items?.length)]);

  const qty = await post({ postback_data: `action=qty&product_id=${encodeURIComponent(productId)}&value=2` });
  tests.push(['step4_cart', qty.ok && qty.step === 'cart_summary']);
  tests.push(['step4_cart_lines', (qty.session?.cart?.length || 0) > 0]);

  const checkout = await post({ postback_data: 'action=checkout' });
  tests.push(['checkout_blocked', checkout.step === 'checkout_blocked' && checkout.error === 'checkout_disabled']);
  tests.push(['flag_off', checkout.enable_ai_checkout === false]);

  let failed = 0;
  for (const [name, pass] of tests) {
    console.log(pass ? '✓' : '✗', name);
    if (!pass) failed++;
  }
  if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll shop-ai-search flow tests passed (steps 1–4, checkout gated).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
