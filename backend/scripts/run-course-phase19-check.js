#!/usr/bin/env node
/**
 * Phase 19 — Payment regression (job/booking/wallet unchanged).
 * Usage: node scripts/run-course-phase19-check.js
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCoursePaymentRegression, PAYMENT_REGRESSION_CHECKS } from '../lib/coursePaymentRegression.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  console.log('=== Course Marketplace Phase 19 — Payment Regression ===\n');
  console.log('Checks defined:', PAYMENT_REGRESSION_CHECKS.length);

  const report = await runCoursePaymentRegression();
  for (const c of report.checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}`);
    if (!c.pass) console.log('    ', JSON.stringify(c.detail));
  }

  console.log(`\nServer: ${report.serverUp ? 'UP' : 'DOWN'} @ ${report.baseUrl}`);
  console.log('Result:', `${report.passCount}/${report.total}`, report.pass ? 'PASS' : 'FAIL');
  console.log('Sign-off status:', report.pass ? 'automated_pass' : 'failed');

  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
