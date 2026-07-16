/**
 * Smoke test: customer food order → dispatch job → rider list (local dev).
 * Run with storefront dev server: npm run dev (port 3003)
 *   node scripts/rider-dispatch-e2e.test.mjs
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function json(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  const userId = `e2e-user-${Date.now()}`;
  const buyerId = `e2e-buyer-${Date.now()}`;

  console.log('1) Register local rider…');
  const reg = await json(`${BASE}/api/rider/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    body: JSON.stringify({
      user_id: userId,
      display_name: 'E2E Rider',
      phone: '0811111111',
      plate: 'E2E-1',
      bank_account: '9999999999',
      vehicle: 'motorcycle',
    }),
  });
  if (!reg.res.ok && reg.res.status !== 409) {
    throw new Error(`register failed: ${reg.res.status} ${JSON.stringify(reg.data)}`);
  }
  const riderId = reg.data.rider_id;
  console.log('   rider_id:', riderId, 'kyc:', reg.data.kyc_status);

  console.log('2) Place local food order (creates dispatch job)…');
  const order = await json(`${BASE}/api/checkout/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buyer_id: buyerId,
      merchant_id: 'food-dev-cafe',
      method: 'cod',
      amount_micro: 850000000,
      shipping_micro: 35000000,
      carrier_id: 'aqond-rider',
      order_type: 'food',
      merchant_name: 'Dev Cafe E2E',
      recipient: 'ลูกค้าทดสอบ',
      phone: '0822222222',
      items: [{ product_id: 'food-item-1', title: 'ข้าวผัด', qty: 1, unit_price_micro: 850000000 }],
    }),
  });
  if (!order.res.ok) {
    throw new Error(`checkout failed: ${order.res.status} ${JSON.stringify(order.data)}`);
  }
  console.log('   order_id:', order.data.order_id, 'source:', order.data.source);

  console.log('3) List open jobs for rider…');
  await new Promise((r) => setTimeout(r, 500));
  const jobs = await json(`${BASE}/api/rider/jobs?status=open`);
  if (!jobs.res.ok) throw new Error(`jobs list failed: ${jobs.res.status}`);
  const hit = (jobs.data.jobs || []).find((j) => j.order_id === order.data.order_id);
  if (!hit) {
    console.error('   jobs:', jobs.data.jobs?.map((j) => ({ id: j.id, order_id: j.order_id })));
    throw new Error('open job not found for new order');
  }
  console.log('   job_id:', hit.id, 'merchant:', hit.merchant_name);

  console.log('4) Accept job…');
  const accept = await json(`${BASE}/api/rider/jobs/${encodeURIComponent(hit.id)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rider_id: riderId }),
  });
  if (!accept.res.ok) {
    throw new Error(`accept failed: ${accept.res.status} ${JSON.stringify(accept.data)}`);
  }
  console.log('   status:', accept.data.job?.status, 'phase:', accept.data.job?.phase);

  console.log('\n✅ Rider dispatch E2E OK');
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
