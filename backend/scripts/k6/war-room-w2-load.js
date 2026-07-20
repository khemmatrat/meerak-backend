/**
 * WAR-W2 — Read-heavy + safe auth probes (no register, no OTP send, no SMS).
 * Requires: k6, BASE_URL, preflight passed (meta/bootstrap 200).
 *
 * Run:
 *   node scripts/war-room-w2-preflight.mjs https://staging-api.example.com
 *   k6 run scripts/k6/war-room-w2-load.js -e BASE_URL=https://staging-api.example.com
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'smoke',
      tags: { scenario: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 150 },
        { duration: '2m', target: 150 },
        { duration: '1m', target: 0 },
      ],
      exec: 'loadMix',
      startTime: '35s',
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }],
    'http_req_duration{endpoint:health}': ['p(95)<800'],
    'http_req_duration{endpoint:meta}': ['p(95)<800'],
    'http_req_duration{endpoint:bootstrap}': ['p(95)<1000'],
    'http_req_duration{endpoint:login_miss}': ['p(95)<1500'],
    'http_req_duration{endpoint:protected_401}': ['p(95)<800'],
  },
};

function taggedGet(path, name) {
  return http.get(`${BASE}${path}`, { tags: { endpoint: name } });
}

function taggedPost(path, name, body) {
  return http.post(`${BASE}${path}`, body, { headers: JSON_HEADERS, tags: { endpoint: name } });
}

export function smoke() {
  const res = taggedGet('/api/health', 'health');
  check(res, { 'health 200': (r) => r.status === 200 });
  sleep(1);
}

/** Cold start + JWT middleware — no writes, no OTP/SMS */
export function loadMix() {
  const meta = taggedGet('/api/meta', 'meta');
  check(meta, { 'meta 200': (r) => r.status === 200 });

  const boot = taggedGet('/api/app/bootstrap', 'bootstrap');
  check(boot, { 'bootstrap 200': (r) => r.status === 200 });

  const health = taggedGet('/api/health', 'health');
  check(health, { 'health 200': (r) => r.status === 200 });

  // Unknown phone → DB lookup + 401 (bcrypt skipped). Avoids polluting users table.
  const phone = `089999${String((__VU * 1000 + __ITER) % 10000).padStart(4, '0')}`;
  const login = taggedPost(
    '/api/auth/login',
    'login_miss',
    JSON.stringify({ phone, password: 'LoadTestWrongPassword!' }),
  );
  check(login, {
    'login miss (401/429)': (r) => [401, 429].includes(r.status),
  });

  const protectedRoute = http.get(`${BASE}/api/videos/my`, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: 'protected_401' },
  });
  check(protectedRoute, { 'protected no token 401': (r) => r.status === 401 });

  sleep(Math.random() * 2);
}
