#!/usr/bin/env node
/** Payment verify must not mark paid without PaySo inquire / capture confirmation. */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const BUYER = `pv-paysec-${Date.now()}`;

async function placePromptPayOrder() {
  const idem = `paysec-${Date.now()}`;
  const res = await fetch(`${BASE}/api/checkout/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buyer_id: BUYER,
      merchant_id: 'e2e-merchant',
      method: 'promptpay',
      amount_micro: 19900,
      shipping_micro: 3900,
      carrier_id: 'flash-th',
      idempotency_key: idem,
      recipient: 'Security Test',
      shipping_address: '1 Test',
      postal_code: '10110',
      phone: '0812345678',
      order_type: 'marketplace',
      items: [{ product_id: 'e2e-pdp-video-001', title: 'Test', qty: 1, unit_price_micro: 19900 }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`place failed: ${JSON.stringify(body)}`);
  return body;
}

async function verify(body) {
  const res = await fetch(`${BASE}/api/checkout/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  const placed = await placePromptPayOrder();
  const ref = placed.payment_action?.payso_reference_id || placed.payment_action?.ref;
  if (!ref || !placed.order_id) throw new Error('missing payment ref from place');

  const blind = await verify({
    ref,
    order_ids: [placed.order_id],
    buyer_id: BUYER,
    expires_at: Date.now() + 60_000,
    amount: placed.payment_action?.amount || '238.00',
  });
  if (blind.body.status === 'success') {
    console.error('FAIL blind verify marked paid without PaySo capture', blind.body);
    process.exit(1);
  }
  console.log('PASS blind verify rejected:', blind.body.status);

  const sim = await fetch(`${BASE}/api/dev/checkout/payment/simulate-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, order_ids: [placed.order_id], buyer_id: BUYER }),
  });
  const simBody = await sim.json().catch(() => ({}));
  if (!sim.ok) {
    console.error('FAIL simulate-capture (is PV_E2E_PAYSO_MOCK=1 set?)', simBody);
    process.exit(1);
  }

  const ok = await verify({
    ref,
    order_ids: [placed.order_id],
    buyer_id: BUYER,
    expires_at: Date.now() + 60_000,
    amount: placed.payment_action?.amount || '238.00',
    intent_id: placed.payment_action?.intent_id,
    payso_reference_id: ref,
  });
  if (ok.body.status !== 'success') {
    console.error('FAIL verify after capture', ok.body);
    process.exit(1);
  }
  console.log('PASS verify after simulate-capture:', ok.body.verified_via);

  const ordersRes = await fetch(`${BASE}/api/orders?buyer_id=${encodeURIComponent(BUYER)}`);
  const ordersJson = await ordersRes.json().catch(() => ({}));
  const hit = (ordersJson.orders || []).find((o) => o.order_id === placed.order_id);
  if (hit?.payment_status !== 'paid') {
    console.error('FAIL order not paid after verified capture', hit);
    process.exit(1);
  }
  console.log('PASS payment-verify-security');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
