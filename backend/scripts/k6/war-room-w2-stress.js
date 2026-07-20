/**
 * WAR-W2 — Stress / breaking-point (read path + safe login miss only).
 * Run after war-room-w2-load.js passes. Watch Render CPU + http_req_failed.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 600 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 },
      ],
      exec: 'stressMix',
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: false }],
  },
};

export function stressMix() {
  const meta = http.get(`${BASE}/api/meta`, { tags: { endpoint: 'meta' } });
  check(meta, { 'meta 200': (r) => r.status === 200 });

  const boot = http.get(`${BASE}/api/app/bootstrap`, { tags: { endpoint: 'bootstrap' } });
  check(boot, { 'bootstrap 200': (r) => r.status === 200 });

  const phone = `0888${String(__VU).padStart(4, '0')}`;
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ phone, password: 'x' }), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'login_miss' },
  });
  check(login, { 'login handled': (r) => [401, 429].includes(r.status) });

  sleep(0.5 + Math.random());
}
