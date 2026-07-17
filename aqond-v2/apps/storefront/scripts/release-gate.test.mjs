#!/usr/bin/env node
/**
 * Release Gate G3 — run all Food OS integration tests in sequence.
 * Requires storefront on :3003 (or STOREFRONT_URL).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const TESTS = [
  'test:lifecycle-event-types',
  'test:packing-proof',
  'test:order-pickup-qr',
  'test:pickup-verification',
  'test:food-delivery-confirm',
  'test:food-happy-path',
  'test:track-os-projection',
  'test:track-os-sse',
  'test:claim-os',
  'test:event-outbox',
];

console.log('Release Gate G3 — Food OS integration bundle\n');

for (const script of TESTS) {
  console.log(`→ npm run ${script}`);
  const r = spawnSync('npm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\nrelease-gate FAILED at ${script}`);
    process.exit(r.status || 1);
  }
}

console.log('\nrelease-gate.test.mjs OK — all integration tests passed');
