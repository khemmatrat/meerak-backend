import http from 'k6/http';
import { check } from 'k6';
import { KONG, setupCatalogProduct, defaultOptions, pause } from './lib/common.js';

export const options = defaultOptions(100, '30s');

export function setup() {
  return setupCatalogProduct(100);
}

export default function (data) {
  const res = http.get(`${KONG}/api/v1/catalog/v1/products/${data.product_id}`);
  check(res, { 'catalog read ok': (r) => r.status === 200 });
  pause();
}
