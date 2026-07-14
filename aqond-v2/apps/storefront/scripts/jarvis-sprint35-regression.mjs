#!/usr/bin/env node
/**
 * Sprint 35 + Phase 1.1 — Jarvis API regression (body contract unchanged)
 *
 * Usage (storefront :3003 recommended):
 *   node apps/storefront/scripts/jarvis-sprint35-regression.mjs
 *   node apps/storefront/scripts/jarvis-sprint35-regression.mjs --base http://127.0.0.1:3003
 */
const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:3003';

const JARVIS_APIS = [
  { method: 'GET', path: '/api/ai/jarvis' },
  { method: 'GET', path: '/api/jarvis/language-profile' },
  { method: 'GET', path: '/api/jarvis/memory' },
  { method: 'GET', path: '/api/jarvis/persona' },
  { method: 'GET', path: '/api/jarvis/voice-profile' },
  { method: 'GET', path: '/api/experience/jarvis-brief' },
];

const JARVIS_POSTS = [
  {
    path: '/api/ai/jarvis',
    body: { user_message: 'สวัสดี', buyer_id: 'regression-guest', surface: 'super' },
  },
  {
    path: '/api/ai/jarvis',
    body: { user_message: 'hello', buyer_id: 'regression-guest', surface: 'super' },
  },
];

async function probe(method, path, body) {
  const url = `${base}${path}`;
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const ms = Date.now() - started;
    const json = method === 'POST' ? await res.json().catch(() => ({})) : {};
    const trace = res.headers.get('x-trace-id');
    const corr = res.headers.get('x-correlation-id');
    const agent = res.headers.get('x-agent-id');
    const pass =
      res.status >= 200 &&
      res.status < 500 &&
      (method !== 'POST' || (json.jarvis || json.mode || json.error));
    const hasTrace = method === 'POST' ? Boolean(trace && corr && agent) : true;
    return {
      path,
      method,
      status: res.status,
      ms,
      pass: pass && hasTrace,
      trace,
      corr,
      agent,
      mode: json.mode,
    };
  } catch (e) {
    return { path, method, status: 0, ms: Date.now() - started, pass: false, error: String(e) };
  }
}

async function main() {
  console.log(`Jarvis Sprint 35 regression — ${base}\n`);
  const results = [];
  for (const { method, path } of JARVIS_APIS) results.push(await probe(method, path));
  for (const { path, body } of JARVIS_POSTS) results.push(await probe('POST', path, body));

  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed += 1;
    const extra = r.trace ? ` trace=${r.trace.slice(0, 8)}…` : '';
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'} ${r.method} ${r.path} → ${r.status} (${r.ms}ms)${extra}${r.mode ? ` mode=${r.mode}` : ''}`,
    );
    if (r.error) console.log(`  ${r.error}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
