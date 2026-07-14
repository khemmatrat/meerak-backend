#!/usr/bin/env node
/**
 * Phase 3 — Hypervisor + Scheduler smoke
 */
const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:8200';

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Phase 3 smoke — ${base}\n`);
  let failed = 0;

  const admit = await post('/guardian/v1/scheduler/admit', {
    ai_id: 'jarvis-prod-01',
    tokens: 100,
    priority: 'jarvis',
  });
  const admitOk = admit.status === 200 && admit.json?.data?.admitted;
  console.log(`${admitOk ? 'PASS' : 'FAIL'} scheduler admit jarvis → ${admit.status}`);
  if (!admitOk) failed += 1;

  const kill = await post('/guardian/v1/kill', {
    scope: 'agent',
    ai_id: 'hermes-worker-01',
    reason: 'smoke_test',
  });
  const killOk = kill.status === 200;
  console.log(`${killOk ? 'PASS' : 'FAIL'} kill hermes → ${kill.status}`);
  if (!killOk) failed += 1;

  const enforce = await post('/guardian/v1/enforce', {
    agent_id: 'hermes-worker-01',
    user_message: 'hello',
    trace_id: 'smoke-hermes-killed',
  });
  const enforceOk = enforce.status === 503;
  console.log(`${enforceOk ? 'PASS' : 'FAIL'} enforce killed agent → ${enforce.status}`);
  if (!enforceOk) failed += 1;

  const rein = await post('/guardian/v1/kill/reinstate', { scope: 'agent', ai_id: 'hermes-worker-01' });
  const reinOk = rein.status === 200;
  console.log(`${reinOk ? 'PASS' : 'FAIL'} reinstate hermes → ${rein.status}`);
  if (!reinOk) failed += 1;

  const jarvis = await post('/guardian/v1/enforce', {
    agent_id: 'jarvis-prod-01',
    user_message: 'สวัสดี',
    trace_id: 'smoke-jarvis-ok',
  });
  const jarvisOk = jarvis.status === 200 && jarvis.json?.decision === 'allow';
  console.log(`${jarvisOk ? 'PASS' : 'FAIL'} enforce jarvis allow → ${jarvis.status}`);
  if (!jarvisOk) failed += 1;

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
