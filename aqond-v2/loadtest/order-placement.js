import http from 'k6/http';
import { check } from 'k6';
import { KONG, setupCatalogProduct, randomBuyer, defaultOptions, pause } from './lib/common.js';

export const options = defaultOptions(30, '30s');

export function setup() {
  return setupCatalogProduct(500);
}

export default function (data) {
  const buyer = randomBuyer();
  const idem = `order-${buyer}`;
  const res = http.post(
    `${KONG}/api/v1/orders/v1/orders`,
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
      },
    }
  );
  check(res, { 'order accepted': (r) => r.status === 202 || r.status === 200 });
  pause();
}
