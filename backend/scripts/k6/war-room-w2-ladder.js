/**
 * WAR-W2 — Soft-launch ladder: 100 → 500 → 1000 VUs (steady 2m each).
 * Set LADDER_STEP=100|500|1000 or run all via npm script chain.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const step = Number(__ENV.LADDER_STEP || '100');
const targets = { 100: 100, 500: 500, 1000: 1000 };
const target = targets[step] || step;

export const options = {
  scenarios: {
    ladder: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target },
        { duration: '2m', target },
        { duration: '1m', target: 0 },
      ],
      exec: 'ladderMix',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function ladderMix() {
  const boot = http.get(`${BASE}/api/app/bootstrap`, { tags: { endpoint: 'bootstrap' } });
  check(boot, { 'bootstrap 200': (r) => r.status === 200 });
  const meta = http.get(`${BASE}/api/meta`, { tags: { endpoint: 'meta' } });
  check(meta, { 'meta 200': (r) => r.status === 200 });
  sleep(0.3 + Math.random() * 0.7);
}
