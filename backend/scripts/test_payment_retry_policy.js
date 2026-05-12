/**
 * Task 12: Deterministic classification + retry schedule unit tests for
 * paymentRetryPolicy.js (no DB — pure functions only).
 *
 * Usage:
 *   node backend/scripts/test_payment_retry_policy.js
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  classifyRetryability,
  computeRetryDelaySeconds,
  RETRY_JITTER_RATIO,
  RETRY_SCHEDULE_SECONDS,
} from '../lib/paymentRetryPolicy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

let pass = 0;
let fail = 0;

function ok(name, cond, detail = undefined) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, detail !== undefined ? detail : '');
  }
}

console.log(`▶ Payment retry policy (Task 12 freeze) — ${backendDir.replace(/\\/g, '/')}\n`);

// -----------------------------------------------------------------------------
// Retry schedule contract
// -----------------------------------------------------------------------------

console.log('[1] computeRetryDelaySeconds(post-fetch attempt_count)');
(() => {
  const want = [
    [1, 30],
    [2, 120],
    [3, 600],
    [4, 1800],
    [5, null],
    [6, null],
  ];
  for (const [attempt, secs] of want) {
    const got = computeRetryDelaySeconds(attempt);
    ok(`attempt ${attempt} => ${secs === null ? 'null' : secs}`, got === secs, { attempt, got, want: secs });
  }
  ok(
    'RETRY_SCHEDULE_SECONDS matches [30,120,600,1800]',
    RETRY_SCHEDULE_SECONDS.length === 4 &&
      JSON.stringify([...RETRY_SCHEDULE_SECONDS]) === JSON.stringify([30, 120, 600, 1800]),
    [...RETRY_SCHEDULE_SECONDS],
  );
  ok('RETRY_JITTER_RATIO frozen at 0 (no jitter)', RETRY_JITTER_RATIO === 0, RETRY_JITTER_RATIO);
})();

// -----------------------------------------------------------------------------
// classifyRetryability contract (explicit cases)
// -----------------------------------------------------------------------------

console.log('\n[2] classifyRetryability — transient / retry paths');
(() => {
  const ec = classifyRetryability(Object.assign(new Error('rst'), { code: 'ECONNRESET' }));
  ok('ECONNRESET => retryable', ec.retryable === true && ec.hardFail !== true && ec.requiresManualReview === false, ec);

  const et = classifyRetryability(Object.assign(new Error('tmo'), { code: 'ETIMEDOUT' }));
  ok('ETIMEDOUT => retryable', et.retryable === true && et.hardFail !== true, et);

  const x503 = classifyRetryability(
    Object.assign(new Error('Service Unavailable'), { response: { status: 503 } }),
  );
  ok(
    'HTTP 503 => retryable UPSTREAM_5XX',
    x503.retryable === true &&
      x503.hardFail !== true &&
      x503.failureCode === 'UPSTREAM_5XX',
    x503,
  );

  const x504 = classifyRetryability(
    Object.assign(new Error('Gateway Timeout'), { response: { status: 504 } }),
  );
  ok(
    'HTTP 504 => retryable UPSTREAM_5XX',
    x504.retryable === true &&
      x504.hardFail !== true &&
      x504.failureCode === 'UPSTREAM_5XX',
    x504,
  );
})();

console.log('\n[3] classifyRetryability — hard fail + manual review');
(() => {
  const sig = classifyRetryability(Object.assign(new Error('x'), { code: 'INVALID_SIGNATURE' }));
  ok(
    'INVALID_SIGNATURE => hard fail + requiresManualReview',
    sig.retryable === false &&
      sig.requiresManualReview === true &&
      sig.failureCode === 'INVALID_SIGNATURE',
    sig,
  );

  const amt = classifyRetryability(Object.assign(new Error('x'), { code: 'AMOUNT_MISMATCH' }));
  ok(
    'AMOUNT_MISMATCH => hard fail + requiresManualReview',
    amt.retryable === false &&
      amt.requiresManualReview === true &&
      amt.failureCode === 'AMOUNT_MISMATCH',
    amt,
  );

  const wm = classifyRetryability(
    Object.assign(new Error('x'), { code: 'wallet_topup_missing_user' }),
  );
  ok(
    'wallet_topup_missing_user => hard fail + requiresManualReview',
    wm.retryable === false &&
      wm.requiresManualReview === true &&
      String(wm.failureCode || '').toUpperCase().includes('WALLET_TOPUP_MISSING_USER'),
    wm,
  );
})();

// -----------------------------------------------------------------------------
console.log('\n────────────────');
console.log(`Total: ${pass + fail} | Passed: ${pass} | Failed: ${fail}`);

process.exit(fail === 0 ? 0 : 1);
