import http from 'k6/http';
import { check, sleep } from 'k6';
import { KONG, setupCatalogProduct, randomBuyer, defaultOptions } from './lib/common.js';

export const options = defaultOptions(30, '20s');

export function setup() {
  const data = setupCatalogProduct(200);
  data.flash_event_id = `flash-${Date.now()}`;
  return data;
}

export default function (data) {
  const buyer = randomBuyer();
  const join = http.post(
    `${KONG}/api/v1/orders/v1/flash/queue`,
    JSON.stringify({ flash_event_id: data.flash_event_id, buyer_id: buyer }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(join, { 'queue join': (r) => r.status === 200 });
  if (join.status !== 200) return;

  const token = join.json().queue_token;
  sleep(2);

  const status = http.get(`${KONG}/api/v1/orders/v1/flash/queue/status?token=${token}`);
  check(status, { 'queue status': (r) => r.status === 200 });

  const idem = `flash-q-${buyer}`;
  const buy = http.post(
    `${KONG}/api/v1/orders/v1/flash/buy`,
    JSON.stringify({
      merchant_id: data.merchant_id,
      store_id: data.store_id,
      buyer_id: buyer,
      variant_id: data.variant_id,
      product_id: data.product_id,
      qty: 1,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idem,
        'X-Flash-Queue-Token': token,
      },
    }
  );
  check(buy, {
    'flash buy result': (r) => r.status === 202 || r.status === 200 || r.status === 403 || r.status === 409,
  });
  sleep(0.1);
}
