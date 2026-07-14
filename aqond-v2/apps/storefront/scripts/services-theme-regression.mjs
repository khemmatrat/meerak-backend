#!/usr/bin/env node
/**
 * Sprint 28i — Services theme migration smoke / regression
 *
 * Usage (storefront dev server must be running on :3003):
 *   node apps/storefront/scripts/services-theme-regression.mjs
 *   node apps/storefront/scripts/services-theme-regression.mjs --base http://127.0.0.1:3003
 */
const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:3003';

const PAGES = [
  '/m/home',
  '/m/home?ftx=1',
  '/m/home?ftx=0',
  '/m/ftx/wizard',
  '/m/ftx/wizard?ftx=1',
  '/m/food',
  '/m/merchant',
  '/m/rider',
  '/m/account',
  '/m/services',
  '/m/services/match',
  '/m/services/match/create',
  '/m/services/match/mine',
  '/m/services/board',
  '/m/services/board/create',
  '/m/services/booking',
  '/m/services/booking/talents',
  '/m/services/booking/mine',
  '/m/services/video',
  '/m/services/video/saved',
  '/m/services/create',
  '/m/services/create/routing',
  '/design-system/registry',
];

const EXPERIENCE_GET = [
  '/api/experience/flags',
  '/api/experience/state',
  '/api/experience/jarvis-brief',
  '/api/experience/rollout',
];

const BFF_GET = [
  '/api/services/match/jobs',
  '/api/services/match/jobs/mine',
  '/api/services/board/jobs',
  { path: '/api/services/board/jobs/mine', auth: true },
  { path: '/api/services/board/jobs/saved', auth: true },
  { path: '/api/services/board/jobs/applications', auth: true },
  '/api/services/booking/providers',
  '/api/services/booking/bookings/mine',
  '/api/services/booking/bookings/incoming',
  '/api/services/video/feed',
  { path: '/api/services/video/saved', auth: true },
];

const BFF_POST_PROBE = [
  { path: '/api/services/match/jobs', body: {} },
  { path: '/api/services/board/jobs', body: {} },
  { path: '/api/services/booking/bookings', body: {} },
];

const EXPERIENCE_POST = [
  { path: '/api/experience/events', body: { event_type: 'ftx.regression_probe' } },
  {
    path: '/api/experience/preferences',
    body: { guest_id: 'guest_regression', interests: ['food_order'], complete_wizard: false },
  },
  { path: '/api/experience/tour', body: { skipped: true } },
];

function okStatus(method, status, auth = false, path = '') {
  if (method === 'GET') {
    if (auth && status === 401) return true;
    return status >= 200 && status < 400;
  }
  // Guest-safe experience analytics / wizard draft
  if (
    (path.startsWith('/api/experience/events') ||
      path.startsWith('/api/experience/preferences') ||
      path.startsWith('/api/experience/tour')) &&
    status >= 200 &&
    status < 300
  ) {
    return true;
  }
  // POST without auth — expect 4xx, not 5xx
  return status >= 400 && status < 500;
}

async function probe(method, path, body, auth = false) {
  const url = `${base}${path}`;
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const ms = Date.now() - started;
    const pass = okStatus(method, res.status, auth, path);
    return { path, method, status: res.status, ms, pass };
  } catch (e) {
    return { path, method, status: 0, ms: Date.now() - started, pass: false, error: String(e) };
  }
}

async function main() {
  console.log(`Services theme regression — ${base}\n`);
  const results = [];

  for (const p of PAGES) results.push(await probe('GET', p));
  for (const entry of BFF_GET) {
    const path = typeof entry === 'string' ? entry : entry.path;
    const auth = typeof entry === 'object' && entry.auth;
    results.push(await probe('GET', path, undefined, auth));
  }
  for (const p of EXPERIENCE_GET) results.push(await probe('GET', p));
  for (const { path, body } of BFF_POST_PROBE) results.push(await probe('POST', path, body));
  for (const { path, body } of EXPERIENCE_POST) results.push(await probe('POST', path, body));

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    const extra = r.error ? ` (${r.error})` : '';
    console.log(`[${mark}] ${r.method} ${r.path} → ${r.status || 'ERR'} ${r.ms}ms${extra}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main();
