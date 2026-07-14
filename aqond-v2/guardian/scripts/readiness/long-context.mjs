#!/usr/bin/env node
/**
 * Long Context — sustained Jarvis + Scheduler load.
 *
 * Usage:
 *   node aqond-v2/guardian/scripts/readiness/long-context.mjs --requests 1000
 *   node aqond-v2/guardian/scripts/readiness/long-context.mjs --requests 100000 --concurrency 8
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOG = path.join(ROOT, 'data', 'long-context-log.jsonl');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const REQUESTS = arg('--requests', 1000);
const CONCURRENCY = arg('--concurrency', 4);
const GUARDIAN = (process.argv.includes('--guardian')
  ? process.argv[process.argv.indexOf('--guardian') + 1]
  : 'http://127.0.0.1:8200'
).replace(/\/$/, '');
const STOREFRONT = (process.argv.includes('--storefront')
  ? process.argv[process.argv.indexOf('--storefront') + 1]
  : 'http://127.0.0.1:3003'
).replace(/\/$/, '');

async function admit(i) {
  const res = await fetch(`${GUARDIAN}/guardian/v1/scheduler/admit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ai_id: 'jarvis-prod-01', tokens: 50, priority: 'jarvis', seq: i }),
  });
  const json = await res.json().catch(() => ({}));
  return { admitted: json.decision !== 'deny' && res.status !== 429, status: res.status, json };
}

async function jarvis(i) {
  const t0 = Date.now();
  const res = await fetch(`${STOREFRONT}/api/ai/jarvis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_message: `long context turn ${i} — continuity check`,
      buyer_id: `long-ctx-${i % 100}`,
    }),
  });
  return { ok: res.status === 200, status: res.status, ms: Date.now() - t0 };
}

async function worker(start, end, stats) {
  for (let i = start; i < end; i++) {
    const a = await admit(i);
    if (!a.admitted) stats.admit_denied += 1;
    const j = await jarvis(i);
    if (j.ok) stats.jarvis_ok += 1;
    else stats.jarvis_fail += 1;
    stats.total += 1;
    if (i % 500 === 0) console.log(`[long-context] ${i}/${REQUESTS} jarvis_ok=${stats.jarvis_ok}`);
  }
}

async function main() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const stats = { total: 0, jarvis_ok: 0, jarvis_fail: 0, admit_denied: 0 };
  const t0 = Date.now();
  const chunk = Math.ceil(REQUESTS / CONCURRENCY);
  const tasks = [];
  for (let c = 0; c < CONCURRENCY; c++) {
    tasks.push(worker(c * chunk, Math.min((c + 1) * chunk, REQUESTS), stats));
  }
  await Promise.all(tasks);
  const elapsed = Date.now() - t0;
  const record = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    elapsed_ms: elapsed,
    rps: Math.round((REQUESTS / elapsed) * 1000),
    ...stats,
    pass: stats.jarvis_fail === 0 && stats.admit_denied < REQUESTS * 0.01,
  };
  fs.appendFileSync(LOG, JSON.stringify(record) + '\n');
  console.log(JSON.stringify(record, null, 2));
  process.exit(record.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
