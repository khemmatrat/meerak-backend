#!/usr/bin/env node
/**
 * AGK soak — daily / cumulative report from soak-log.jsonl
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOG = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data', 'soak-log.jsonl');
const days = (() => {
  const i = process.argv.indexOf('--days');
  return i >= 0 ? Number(process.argv[i + 1]) : 7;
})();

function load() {
  if (!fs.existsSync(LOG)) return [];
  return fs
    .readFileSync(LOG, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const all = load();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = all.filter((r) => new Date(r.ts).getTime() >= cutoff);

  const byDay = new Map();
  for (const r of rows) {
    const day = r.ts.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r);
  }

  const l0ms = rows.map((r) => r.jarvis_l0?.ms).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  const p99 = l0ms.length ? l0ms[Math.floor(l0ms.length * 0.99)] : null;

  const pass = rows.filter((r) => r.pass).length;
  const fail = rows.length - pass;

  console.log(`AGK Soak Report — last ${days} day(s)\n`);
  console.log(`Probes: ${rows.length}  pass: ${pass}  fail: ${fail}`);
  console.log(`Days with data: ${byDay.size} / ${days} required for sign-off`);
  console.log(`Jarvis L0 latency p99: ${p99 ?? 'n/a'} ms (target ≤ overhead budget + baseline)`);
  console.log(`Trace coverage: ${rows.filter((r) => r.jarvis_l0?.trace).length}/${rows.length}`);

  console.log('\nPer day:');
  for (const [day, list] of [...byDay.entries()].sort()) {
    const ok = list.filter((r) => r.pass).length;
    console.log(`  ${day}  probes=${list.length}  pass=${ok}`);
  }

  if (byDay.size >= days && fail === 0) {
    console.log('\n✅ Automated soak criteria met — ready for owner sign-off (052)');
    process.exit(0);
  }
  console.log('\n⏳ Soak in progress — keep soak-run.mjs running');
  process.exit(fail > 0 ? 1 : 0);
}

main();
