#!/usr/bin/env node
/**
 * Phase 2 — ACP + Knowledge Plane smoke test
 */
import crypto from 'crypto';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:8200';

const traceId = crypto.randomUUID();

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`Phase 2 smoke — ${base}\n`);
  let failed = 0;

  const k = await get('/guardian/v1/knowledge/query?q=jarvis&locale=th');
  const kOk = k.status === 200 && k.json?.data?.hit_count >= 1;
  console.log(`${kOk ? 'PASS' : 'FAIL'} knowledge query → ${k.status}`);
  if (!kOk) failed += 1;

  const acp = await post('/guardian/v1/acp/deliver', {
    acp_version: '1',
    message_id: crypto.randomUUID(),
    trace_id: traceId,
    sender: { ai_id: 'jarvis-prod-01' },
    receiver: { ai_id: 'hermes-worker-01' },
    intent: 'query.knowledge',
    payload: { query: 'คืนเงิน', locale: 'th' },
    occurred_at: new Date().toISOString(),
    ttl_sec: 60,
  });
  const acpOk = acp.status === 200 && acp.json?.decision === 'deliver';
  console.log(`${acpOk ? 'PASS' : 'FAIL'} acp deliver → ${acp.status}`);
  if (!acpOk) failed += 1;

  const inbox = await get('/guardian/v1/acp/inbox/hermes-worker-01');
  const inboxOk = inbox.status === 200 && (inbox.json?.data?.messages?.length || 0) > 0;
  console.log(`${inboxOk ? 'PASS' : 'FAIL'} hermes inbox → ${inbox.status}`);
  if (!inboxOk) failed += 1;

  const deny = await post('/guardian/v1/acp/deliver', {
    acp_version: '1',
    message_id: crypto.randomUUID(),
    trace_id: crypto.randomUUID(),
    sender: { ai_id: 'jarvis-prod-01' },
    receiver: { ai_id: 'sentinel-01' },
    intent: 'notify',
    payload: {},
    occurred_at: new Date().toISOString(),
    ttl_sec: 60,
  });
  const denyOk = deny.status === 403 || deny.status === 404;
  console.log(`${denyOk ? 'PASS' : 'FAIL'} acp allowlist deny → ${deny.status}`);
  if (!denyOk) failed += 1;

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
