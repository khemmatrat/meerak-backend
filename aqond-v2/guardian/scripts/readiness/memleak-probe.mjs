#!/usr/bin/env node
/**
 * AGK Memory Leak probe — sample /guardian/v1/metrics/runtime every interval.
 * Run alongside guardian-api for 72h; analyze with memleak-report.mjs.
 *
 * Usage:
 *   node aqond-v2/guardian/scripts/readiness/memleak-probe.mjs
 *   node aqond-v2/guardian/scripts/readiness/memleak-probe.mjs --interval-ms 300000
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOG = path.join(ROOT, 'data', 'memleak-log.jsonl');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const GUARDIAN = arg('--guardian', 'http://127.0.0.1:8200').replace(/\/$/, '');
const INTERVAL = Number(arg('--interval-ms', '300000'));
const ONCE = process.argv.includes('--once');

async function sample() {
  const t0 = Date.now();
  const res = await fetch(`${GUARDIAN}/guardian/v1/metrics/runtime`);
  const json = await res.json().catch(() => ({}));
  const data = json?.data || {};
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ok: res.status === 200,
    fetch_ms: Date.now() - t0,
    heap_used_mb: data.memory?.heap_used_mb,
    heap_total_mb: data.memory?.heap_total_mb,
    rss_mb: data.memory?.rss_mb,
    uptime_sec: data.uptime_sec,
    active_resources: data.active_resources,
  };
}

async function tick() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const row = await sample();
  fs.appendFileSync(LOG, JSON.stringify(row) + '\n');
  console.log(`[memleak] heap=${row.heap_used_mb}MB rss=${row.rss_mb}MB uptime=${row.uptime_sec}s`);
}

async function main() {
  if (ONCE) {
    await tick();
    return;
  }
  console.log(`[memleak-probe] interval=${INTERVAL}ms log=${LOG}`);
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
