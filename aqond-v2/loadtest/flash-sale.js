import http from 'k6/http';
import { check } from 'k6';
import { KONG, setupCatalogProduct, randomBuyer, defaultOptions, pause } from './lib/common.js';

export const options = defaultOptions(50, '30s');

export function setup() {
  return setupCatalogProduct(1000);
}

export default function (data) {
  const buyer = randomBuyer();
  const idem = `flash-${buyer}`;
  const res = http.post(
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
      },
    }
  );
  check(res, {
    'flash buy accepted or conflict': (r) => r.status === 202 || r.status === 200 || r.status === 409,
    'not queue_full storm': (r) => r.status !== 503 || r.body.includes('queue_full'),
  });
  pause();
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
    'loadtest/results/flash-sale-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics || {};
  const p95 = metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const rate = metrics.http_reqs?.values?.rate ?? 0;
  const failed = metrics.http_req_failed?.values?.rate ?? 0;
  return [
    '=== flash-sale baseline ===',
    `p95_ms: ${p95.toFixed(2)}`,
    `req_rate: ${rate.toFixed(2)}/s`,
    `fail_rate: ${(failed * 100).toFixed(2)}%`,
  ].join('\n');
}
