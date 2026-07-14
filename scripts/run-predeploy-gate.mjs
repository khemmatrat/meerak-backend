#!/usr/bin/env node
/**
 * Pre-deploy gate — run all Track 1/2 test suites in one batch.
 * Requires storefront on STOREFRONT_URL (default :3003) and backend on BACKEND_URL (default :3001) where noted.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOREFRONT = path.join(ROOT, 'aqond-v2', 'apps', 'storefront');
const BACKEND = path.join(ROOT, 'backend');
const LOG_DIR = path.join(ROOT, '.data', 'predeploy-logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const env = {
  ...process.env,
  STOREFRONT_URL: process.env.STOREFRONT_URL || 'http://127.0.0.1:3003',
  ADMIN_API_BASE: process.env.ADMIN_API_BASE || process.env.BACKEND_URL || 'http://127.0.0.1:3001',
};

function run(label, cmd, args, cwd, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const ok = r.status === 0;
  // Combine BOTH streams — the actual error/stack usually lands on stderr, and the
  // previous `stdout || stderr` dropped stderr whenever any stdout existed (e.g. the
  // npm banner), hiding the real failure reason. Always persist the full output.
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  const combined = `${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ''}`.trim();
  const logFile = path.join(LOG_DIR, `${label.replace(/[^a-z0-9]+/gi, '_')}.log`);
  fs.writeFileSync(
    logFile,
    `# ${label}\n# cmd: ${cmd} ${args.join(' ')}\n# cwd: ${cwd}\n# status: ${r.status}\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n`,
  );
  // Show more context for failures so the table is actionable without opening logs.
  const tailLines = ok ? 3 : 12;
  return {
    label,
    ok,
    status: r.status ?? 1,
    logFile,
    tail: combined.split('\n').slice(-tailLines).join(' | '),
  };
}

const results = [];

// Playwright e2e — single invocation (one webServer)
const e2eSpecs = [
  'e2e/pv-s005-cart-view.spec.ts',
  'e2e/pv-s006-checkout-start.spec.ts',
  'e2e/pv-s007-place-order.spec.ts',
  'e2e/pv-s008-payment-ui.spec.ts',
  'e2e/pv-s009-payment-verify.spec.ts',
  'e2e/pv-s010-payment-result.spec.ts',
  'e2e/pv-b27-s001-return-request.spec.ts',
  'e2e/pv-b27-s002-refund-detail.spec.ts',
  'e2e/pv-b27-s003-escrow-adapter.spec.ts',
];
results.push(
  run('playwright:S005-S010+B2.7', 'npx', ['playwright', 'test', ...e2eSpecs], STOREFRONT),
);

// Storefront integration (default backend on :3003)
const storefrontTests = [
  'test:escrow-concurrent',
  'test:payment-escrow-duplicate',
  'test:order-auto-confirm-concurrent',
  'test:order-auto-confirm-prior-release',
  'test:payment-verify-security',
  'test:platform-commission',
  'test:wallet-concurrent',
  'test:wallet-reconcile',
];
for (const script of storefrontTests) {
  results.push(run(`storefront:${script}`, 'npm', ['run', script], STOREFRONT));
}

// SQLite backend coverage (alternate port if STOREFRONT_SQLITE_URL set)
if (process.env.STOREFRONT_SQLITE_URL) {
  const sqliteTests = ['test:platform-commission', 'test:wallet-concurrent', 'test:wallet-reconcile'];
  for (const script of sqliteTests) {
    results.push(
      run(`storefront:${script}-sqlite`, 'npm', ['run', script], STOREFRONT, {
        STOREFRONT_URL: process.env.STOREFRONT_SQLITE_URL,
      }),
    );
  }
}

// Backend RBAC + webhook
results.push(
  run('backend:marketplaceCommissionAdmin-rbac', 'node', ['--test', '__tests__/marketplaceCommissionAdmin.test.js'], BACKEND),
);
results.push(
  run('backend:payment-webhook-security', 'node', ['scripts/test_payment_webhook_security.js'], BACKEND),
);
results.push(
  run('backend:payment-webhook-worker', 'node', ['scripts/test_payment_webhook_worker.js'], BACKEND),
);

if (process.env.RUN_MARKETPLACE_ADMIN_SMOKE === '1') {
  results.push(
    run('backend:marketplace-commission-admin-smoke', 'node', ['scripts/marketplace-commission-admin-rbac.test.mjs'], BACKEND),
  );
}

console.log('\n=== PRE-DEPLOY GATE RESULTS ===\n');
console.log('| Suite | Result | Detail |');
console.log('|-------|--------|--------|');
let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) failed += 1;
  console.log(`| ${r.label} | ${mark} | ${r.tail.replace(/\|/g, '/')} |`);
}
console.log(`\nTotal: ${results.length} | Pass: ${results.length - failed} | Fail: ${failed}\n`);
if (failed) {
  console.log('Failed suites — full logs:');
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  - ${r.label}: ${r.logFile}`);
  }
  console.log('');
}
process.exit(failed ? 1 : 0);
