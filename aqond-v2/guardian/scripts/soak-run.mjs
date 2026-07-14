#!/usr/bin/env node
/**
 * AGK soak — continuous probe loop (default every 5 min)
 *
 * Usage:
 *   node aqond-v2/guardian/scripts/soak-run.mjs
 *   node aqond-v2/guardian/scripts/soak-run.mjs --interval-ms 300000
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(ROOT, 'soak-probe.mjs');

const intervalMs = (() => {
  const i = process.argv.indexOf('--interval-ms');
  return i >= 0 ? Number(process.argv[i + 1]) : 300_000;
})();

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROBE, ...process.argv.slice(2)], { stdio: 'inherit' });
    child.on('close', (code) => resolve(code));
  });
}

console.log(`[soak-run] interval=${intervalMs}ms log=guardian/data/soak-log.jsonl`);
console.log('[soak-run] Ctrl+C to stop\n');

async function loop() {
  for (;;) {
    const ts = new Date().toISOString();
    console.log(`\n[soak-run] probe ${ts}`);
    await runOnce();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
