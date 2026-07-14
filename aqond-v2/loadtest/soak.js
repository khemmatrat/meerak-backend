import http from 'k6/http';
import { check, sleep } from 'k6';
import { KONG, defaultOptions } from './lib/common.js';

// P176: long soak — run with DURATION=24h in prod-like env.
export const options = {
  ...defaultOptions(20, '5m'),
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

const endpoints = [
  '/api/v1/catalog/v1/stores',
  '/api/v1/bff/v1/home',
  '/api/v1/search/v1/suggest?q=a',
  '/api/v1/sre/v1/slo',
];

export default function () {
  const path = endpoints[__ITER % endpoints.length];
  const r = http.get(`${KONG}${path}`, { headers: { 'X-Aqond-Region': 'TH' } });
  check(r, { 'soak ok': (x) => x.status < 500 });
  sleep(1);
}
