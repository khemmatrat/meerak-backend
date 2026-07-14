import http from 'k6/http';
import { check, sleep } from 'k6';
import { KONG, setupCatalogProduct, randomBuyer, defaultOptions } from './lib/common.js';

// P198: full-scale rehearsal — flash + browse + search + checkout probe in one run.
export const options = defaultOptions(40, '90s');

export function setup() {
  return setupCatalogProduct(2000);
}

export default function (data) {
  const buyer = randomBuyer();
  const roll = __ITER % 4;
  if (roll === 0) {
    const r = http.post(
      `${KONG}/api/v1/orders/v1/flash/buy`,
      JSON.stringify({
        merchant_id: data.merchant_id,
        store_id: data.store_id,
        buyer_id: buyer,
        variant_id: data.variant_id,
        product_id: data.product_id,
        qty: 1,
      }),
      { headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `reh-${buyer}` } },
    );
    check(r, { 'flash': (x) => x.status === 202 || x.status === 200 || x.status === 409 });
  } else if (roll === 1) {
    check(http.get(`${KONG}/api/v1/bff/v1/home`), { 'home': (x) => x.status === 200 });
  } else if (roll === 2) {
    check(http.get(`${KONG}/api/v1/bff/v1/search?q=test`), { 'search': (x) => x.status === 200 || x.status === 502 });
  } else {
    check(http.get(`${KONG}/api/v1/bff/v1/feed?kind=for-you`, {
      headers: { 'X-User-Id': buyer },
    }), { 'feed': (x) => x.status === 200 });
  }
  sleep(0.1);
}
