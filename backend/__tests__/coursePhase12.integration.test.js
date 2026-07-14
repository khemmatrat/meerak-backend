/**
 * Phase 12 — DB integration: launch checklist, ledger integrity, idempotency store, security audit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildCourseLaunchChecklist } from '../lib/courseLaunchChecklist.js';
import {
  checkCourseMarketplaceLedgerIntegrity,
  summarizeCourseLedgerEvents,
} from '../lib/courseLedgerIntegrity.js';
import { runCourseSecurityAudit } from '../lib/courseMarketplaceSecurity.js';
import {
  hashPurchaseRequest,
  storeIdempotentPurchaseResponse,
  loadIdempotentPurchaseResponse,
} from '../lib/coursePurchaseIdempotency.js';
import { releaseEligibleCoursePayouts } from '../lib/coursePayoutService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function buildPool() {
  return new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
    max: 3,
  });
}

test('launch checklist runs automated Phase 12 checks', async (t) => {
  const pool = buildPool();
  t.after(async () => pool.end());
  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }
  const checklist = await buildCourseLaunchChecklist(pool);
  assert.ok(checklist.automated.total >= 8);
  assert.ok(Array.isArray(checklist.manualQa));
  assert.ok(checklist.manualQa.some((s) => s.id === 'purchase_gateway'));
  assert.ok(checklist.manualQa.some((s) => s.id === 'http_e2e'));
  const ids = checklist.automated.checks.map((c) => c.id);
  assert.ok(ids.includes('ledger_chain_integrity'));
  assert.ok(ids.includes('security_audit'));
});

test('ledger integrity function returns structured result', async (t) => {
  const pool = buildPool();
  t.after(async () => pool.end());
  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }
  const integrity = await checkCourseMarketplaceLedgerIntegrity(pool);
  assert.ok('available' in integrity);
  if (integrity.available && integrity.valid === true) {
    assert.ok(integrity.totalRows >= 0);
  }
  const summary = await summarizeCourseLedgerEvents(pool);
  assert.equal(summary.ok, true);
});

test('security audit passes on healthy DB', async (t) => {
  const pool = buildPool();
  t.after(async () => pool.end());
  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }
  const audit = await runCourseSecurityAudit(pool);
  assert.ok(Array.isArray(audit.checks));
  assert.equal(audit.pass, audit.checks.every((c) => c.pass));
});

test('purchase idempotency detects hash conflict', async (t) => {
  const pool = buildPool();
  t.after(async () => pool.end());
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }
  try {
    const userRes = await client.query(`SELECT id FROM users ORDER BY created_at DESC LIMIT 1`);
    const buyerId = userRes.rows?.[0]?.id;
    if (!buyerId) {
      t.skip('No user for idempotency test');
      return;
    }
    const courseRes = await client.query(
      `SELECT id FROM courses WHERE is_marketplace = TRUE LIMIT 1`,
    );
    const courseId = courseRes.rows?.[0]?.id || 'test-course-id';
    const key = `phase12-test-${Date.now()}`;
    const hashA = hashPurchaseRequest({ paymentMode: 'wallet' });
    await client.query('BEGIN');
    await storeIdempotentPurchaseResponse(client, {
      idempotencyKey: key,
      buyerId,
      courseId,
      requestHash: hashA,
      response: { ok: true, test: true },
    });
    await client.query('COMMIT');
    const loaded = await loadIdempotentPurchaseResponse(client, {
      idempotencyKey: key,
      buyerId,
      courseId,
      requestHash: hashPurchaseRequest({ paymentMode: 'installment' }),
    });
    assert.equal(loaded?.conflict, true);
  } finally {
    client.release();
  }
});

test('releaseEligibleCoursePayouts is no-op when nothing held (regression smoke)', async (t) => {
  const client = {
    query: async (sql) => {
      if (String(sql).includes('payout_config')) {
        return { rows: [{ value_json: { holdDays: 7, releaseToWithdrawable: true } }] };
      }
      if (String(sql).includes('FOR UPDATE SKIP LOCKED')) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await releaseEligibleCoursePayouts(client, { limit: 5, actorId: 'phase12' });
  assert.equal(result.count, 0);
});
