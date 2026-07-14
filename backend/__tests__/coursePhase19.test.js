/**
 * Phase 19 — payment regression unit checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runCoursePaymentRegression,
  PAYMENT_REGRESSION_CHECKS,
} from '../lib/coursePaymentRegression.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(__dirname, '..');

test('PAYMENT_REGRESSION_CHECKS covers core flows', () => {
  const ids = PAYMENT_REGRESSION_CHECKS.map((c) => c.id);
  assert.ok(ids.includes('wallet_deposit_preview'));
  assert.ok(ids.includes('jobs_recommended'));
  assert.ok(ids.includes('no_financial_engine_in_course'));
});

test('course purchase modules do not import financialEngine', async () => {
  const report = await runCoursePaymentRegression('http://127.0.0.1:1');
  const isolated = report.checks.find((c) => c.id === 'no_financial_engine_in_course');
  assert.equal(isolated?.pass, true);
});

test('server.js still exposes legacy wallet deposit and booking pay-deposit', () => {
  const server = readFileSync(join(BACKEND, 'server.js'), 'utf8');
  assert.match(server, /app\.get\('\/api\/wallet\/deposit\/preview'/);
  assert.match(server, /app\.post\('\/api\/bookings\/:id\/pay-deposit'/);
});
