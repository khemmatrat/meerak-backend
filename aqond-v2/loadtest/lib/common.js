import http from 'k6/http';
import { check, sleep } from 'k6';

export const KONG = __ENV.KONG || 'http://host.docker.internal:8000';

export function setupCatalogProduct(stock = 500) {
  const merchant = `load-${Date.now()}`;
  const storeRes = http.post(
    `${KONG}/api/v1/catalog/v1/stores`,
    JSON.stringify({
      merchant_id: merchant,
      slug: `shop-${merchant}`,
      display_name: 'Load Test Shop',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(storeRes, { 'store created': (r) => r.status === 200 });
  const store = storeRes.json().store;

  const prodRes = http.post(
    `${KONG}/api/v1/catalog/v1/products`,
    JSON.stringify({
      store_id: store.id,
      merchant_id: merchant,
      title: 'Load Test SKU',
      price_micro: 10000,
      inventory: stock,
      status: 'draft',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(prodRes, { 'product created': (r) => r.status === 200 });
  const product = prodRes.json();

  http.post(`${KONG}/api/v1/catalog/v1/products/${product.product.id}/publish`);

  return {
    merchant_id: merchant,
    store_id: store.id,
    variant_id: product.variant.id,
    product_id: product.product.id,
  };
}

export function randomBuyer() {
  return `buyer-${__VU}-${__ITER}-${Date.now()}`;
}

export function defaultOptions(vus, duration) {
  return {
    vus: Number(__ENV.VUS || vus),
    duration: __ENV.DURATION || duration,
    thresholds: {
      http_req_failed: ['rate<0.10'],
      http_req_duration: ['p(95)<5000'],
    },
  };
}

export function pause() {
  sleep(0.05);
}
