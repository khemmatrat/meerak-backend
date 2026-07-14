#!/usr/bin/env node
/**
 * Analyze memleak-log.jsonl — flag monotonic heap growth over window.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOG = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 'data', 'memleak-log.jsonl');
const hours = (() => {
  const i = process.argv.indexOf('--hours');
  return i >= 0 ? Number(process.argv[i + 1]) : 72;
})();

function load() {
  if (!fs.existsSync(LOG)) return [];
  return fs
    .readFileSync(LOG, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function main() {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const rows = load().filter((r) => new Date(r.ts).getTime() >= cutoff && r.heap_used_mb != null);
  if (rows.length < 2) {
    console.log(`Insufficient samples (${rows.length}) — need memleak-probe running`);
    process.exit(1);
  }

  const first = rows[0].heap_used_mb;
  const last = rows.at(-1).heap_used_mb;
  const growthPct = ((last - first) / first) * 100;
  const leakSuspect = growthPct > 15 && rows.length > 20;

  console.log(`AGK Memleak Report — last ${hours}h\n`);
  console.log(`Samples: ${rows.length}`);
  console.log(`Heap: ${first} MB → ${last} MB (${growthPct.toFixed(1)}% change)`);
  console.log(`RSS: ${rows[0].rss_mb} MB → ${rows.at(-1).rss_mb} MB`);

  if (leakSuspect) {
    console.log('\n⚠️  SUSPECT: heap grew >15% — investigate before Phase 4');
    process.exit(1);
  }
  console.log('\n✅ No monotonic heap growth flagged (threshold 15%)');
  process.exit(0);
}

main();
