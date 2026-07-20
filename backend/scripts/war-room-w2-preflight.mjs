#!/usr/bin/env node
/**
 * W2 gate — refuse load tests until deploy smoke passes (meta/bootstrap 200).
 * Usage: node scripts/war-room-w2-preflight.mjs [baseUrl]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = (process.argv[2] || process.env.BASE_URL || process.env.WAR_ROOM_API_BASE || '').replace(/\/$/, '');
if (!base) {
  console.error('Usage: war-room-w2-preflight.mjs <baseUrl>  (or set BASE_URL)');
  process.exit(2);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const smoke = path.join(dir, 'war-room-auth-smoke.mjs');
const r = spawnSync(process.execPath, [smoke, base], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
if (r.stdout) process.stdout.write(r.stdout);
if (r.status !== 0) {
  console.error(`\n[W2 preflight FAIL] Fix deploy/smoke on ${base} before load test.`);
  process.exit(1);
}
console.log(`[W2 preflight OK] ${base} ready for k6.`);
process.exit(0);
