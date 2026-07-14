/**
 * Integration test wrapper for Manual QA 12 steps.
 * Run: node --test __tests__/courseManualQa.integration.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCourseManualQa } from '../lib/courseManualQaRunner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function buildPool() {
  return new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
    max: 5,
  });
}

test('manual QA 12 steps — DB + HTTP automated runner', async (t) => {
  const pool = buildPool();
  t.after(async () => pool.end());

  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }

  const skipE2e = process.env.SKIP_E2E === '1';
  const report = await runCourseManualQa(pool, { skipE2e });
  assert.equal(report.total, 12);

  for (const step of report.results) {
    if (!step.pass) {
      console.error(`FAIL ${step.id}:`, JSON.stringify(step.detail));
    }
  }

  assert.equal(report.pass, true, `manual QA failed ${report.passCount}/${report.total}`);
  assert.equal(report.signOff.manualQaComplete, true);
});
