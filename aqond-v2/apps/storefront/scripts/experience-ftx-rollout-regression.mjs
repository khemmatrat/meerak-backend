#!/usr/bin/env node
/**
 * Sprint 30f — FTX rollout regression (verticals + funnel API)
 *
 * Usage (storefront :3003 + backend :3001 must be running):
 *   node apps/storefront/scripts/experience-ftx-rollout-regression.mjs
 *   node apps/storefront/scripts/experience-ftx-rollout-regression.mjs --base http://127.0.0.1:3003
 */
const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:3003';

const VERTICAL_PAGES = [
  '/m/home',
  '/m/home?ftx=1',
  '/m/home?ftx=0',
  '/m/ftx/wizard',
  '/m/food',
  '/m/merchant',
  '/m/merchant/shops',
  '/m/rider',
  '/m/rider/signup',
  '/m/account',
  '/m/feed',
  '/m/cart',
  '/m/sell',
  '/m/services',
  '/m/auth/handoff',
];

const EXPERIENCE_APIS = [
  '/api/experience/flags',
  '/api/experience/state',
  '/api/experience/rollout',
  '/api/experience/jarvis-brief',
];

const EXPERIENCE_POST = [
  { path: '/api/experience/events', body: { event_type: 'ftx.rollout_probe', guest_id: 'rollout_regression' } },
];

function okStatus(method, status, path = '') {
  if (method === 'GET') return status >= 200 && status < 400;
  if (path.startsWith('/api/experience/events') && status >= 200 && status < 300) return true;
  return status >= 400 && status < 500;
}

async function probe(method, path, body) {
  const url = `${base}${path}`;
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const ms = Date.now() - started;
    const pass = okStatus(method, res.status, path);
    return { path, method, status: res.status, ms, pass };
  } catch (e) {
    return { path, method, status: 0, ms: Date.now() - started, pass: false, error: String(e) };
  }
}

async function main() {
  console.log(`FTX rollout regression — ${base}\n`);
  const results = [];

  for (const p of VERTICAL_PAGES) results.push(await probe('GET', p));
  for (const p of EXPERIENCE_APIS) results.push(await probe('GET', p));
  for (const { path, body } of EXPERIENCE_POST) results.push(await probe('POST', path, body));

  const rolloutRes = await fetch(`${base}/api/experience/rollout`);
  if (rolloutRes.ok) {
    const data = await rolloutRes.json().catch(() => ({}));
    const liveOk = data.version === '30f' && typeof data.live === 'boolean';
    results.push({
      path: '/api/experience/rollout (version)',
      method: 'GET',
      status: rolloutRes.status,
      ms: 0,
      pass: liveOk,
    });
  }

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
