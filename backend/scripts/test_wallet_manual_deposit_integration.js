/**
 * Integration checks against a real Postgres (migrations 158–165 applied).
 *
 *   cd backend && node scripts/test_wallet_manual_deposit_integration.js
 *
 * Skips with exit 0 when DATABASE_URL is unset (CI / local without DB).
 * Optional: destroys test rows by firebase_uid prefix wmdi_*
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';

const { Pool } = pg;
import {
  mapManualDepositInsertUniqueViolation,
  mapManualDepositBankRefUniqueViolation,
  composeManualRejectReasonRecord,
} from '../lib/walletManualDepositRoutes.js';
import { creditWalletDepositFromManualApproval } from '../lib/walletDepositHybrid.js';

const RUN = `wmdi_${Date.now()}`;

async function insertUser(pool, { id, email, phone, fb }) {
  const hash = await bcrypt.hash(`${RUN}_pw`, 10);
  try {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, kyc_level, wallet_balance, wallet_balance_withdrawable,
         provider_available, expert_category, account_status,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'user', 'UNVERIFIED', 'level_2', 1000, 1000,
         false, null, 'active',
         NOW(), NOW()
       )`,
      [id, fb, email, phone, hash]
    );
  } catch (_) {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status,
         wallet_balance_withdrawable, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'user', 'UNVERIFIED', 1000, 'active',
         1000, NOW(), NOW()
       )`,
      [id, fb, email, phone, hash]
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('SKIP test_wallet_manual_deposit_integration.js: DATABASE_URL unset');
    process.exit(0);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cleanupIds = [];

  async function tearDown() {
    if (!cleanupIds.length) return;
    const uuids = [...new Set(cleanupIds)];
    await pool.query(`DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])`, [uuids]).catch(() => {});
    await pool.query(`DELETE FROM payment_ledger_audit WHERE user_id = ANY($1::uuid[])`, [uuids]).catch(() => {});
    await pool.query(`DELETE FROM manual_deposits WHERE user_id = ANY($1::uuid[])`, [uuids]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [uuids]).catch(() => {});
  }

  try {
    const uidRow = await pool.query('SELECT gen_random_uuid() AS id');
    const uid = uidRow.rows[0].id;
    cleanupIds.push(uid);
    const phone = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    await insertUser(pool, {
      id: uid,
      email: `${RUN}@fixture.local`,
      phone,
      fb: `${RUN}_fb`,
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const slipA = 'a'.repeat(64);
      await client.query(
        `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
         VALUES ($1::uuid, 100.0, $2, $3, 'manual_pending_verification')`,
        [uid, `https://example.invalid/slip1`, slipA]
      );
      try {
        await client.query(
          `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
           VALUES ($1::uuid, 200.0, $2, $3, 'manual_pending_verification')`,
          [uid, `https://example.invalid/slip2`, slipA]
        );
        assert.fail('expected duplicate slip unique violation');
      } catch (e) {
        const m = mapManualDepositInsertUniqueViolation(e);
        assert.equal(m?.code, 'MANUAL_DEPOSIT_DUPLICATE_SLIP');
      }

      const slipB = 'b'.repeat(64);
      const slipC = 'c'.repeat(64);
      await client.query(
        `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
         VALUES ($1::uuid, 50.0, $2, $3, 'manual_pending_verification')`,
        [uid, `https://example.invalid/slip3`, slipB]
      );
      try {
        await client.query(
          `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
           VALUES ($1::uuid, 50.0, $2, $3, 'manual_pending_verification')`,
          [uid, `https://example.invalid/slip4`, slipC]
        );
        assert.fail('expected duplicate pending amount unique violation');
      } catch (e) {
        const m = mapManualDepositInsertUniqueViolation(e);
        assert.equal(m?.code, 'MANUAL_DEPOSIT_DUPLICATE_AMOUNT_PENDING');
      }

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    /** Approve path + bank_ref collision */
    const ids = await pool.query('SELECT gen_random_uuid() AS a, gen_random_uuid() AS b');
    const uid1 = ids.rows[0].a;
    const uid2 = ids.rows[0].b;
    cleanupIds.push(uid1, uid2);
    const p1 = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const p2 = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    await insertUser(pool, {
      id: uid1,
      email: `${RUN}_u1@fixture.local`,
      phone: p1,
      fb: `${RUN}_u1`,
    });
    await insertUser(pool, {
      id: uid2,
      email: `${RUN}_u2@fixture.local`,
      phone: p2,
      fb: `${RUN}_u2`,
    });

    const sha1 = 'd'.repeat(64);
    const sha2 = 'e'.repeat(64);
    const ins1 = await pool.query(
      `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
       VALUES ($1::uuid, 77.0, $2, $3, 'manual_pending_verification') RETURNING id`,
      [uid1, `https://example.invalid/m1`, sha1]
    );
    const manualId1 = ins1.rows[0].id;
    const ins2 = await pool.query(
      `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
       VALUES ($1::uuid, 88.0, $2, $3, 'manual_pending_verification') RETURNING id`,
      [uid2, `https://example.invalid/m2`, sha2]
    );
    const manualId2 = ins2.rows[0].id;

    const balBefore = (
      await pool.query('SELECT wallet_balance FROM users WHERE id = $1::uuid', [uid1])
    ).rows[0];
    const w0 = Number(balBefore.wallet_balance);

    await creditWalletDepositFromManualApproval(pool, {
      userId: String(uid1),
      manualDepositId: String(manualId1),
      grossAmount: 77,
      reviewedBy: 'integration_test',
      bankRefId: `REF_${RUN}_SHARED`,
    });

    const st1 = (await pool.query('SELECT status FROM manual_deposits WHERE id = $1::uuid', [manualId1]))
      .rows[0];
    assert.equal(String(st1.status), 'approved');

    const w1 = Number(
      (await pool.query('SELECT wallet_balance FROM users WHERE id = $1::uuid', [uid1])).rows[0]
        .wallet_balance
    );
    assert.equal(w1, w0 + 77);

    try {
      await creditWalletDepositFromManualApproval(pool, {
        userId: String(uid2),
        manualDepositId: String(manualId2),
        grossAmount: 88,
        reviewedBy: 'integration_test',
        bankRefId: `REF_${RUN}_SHARED`,
      });
      assert.fail('expected bank_ref unique violation on second approve');
    } catch (e) {
      const m = mapManualDepositBankRefUniqueViolation(e);
      assert.equal(m?.code, 'BANK_REF_DUPLICATE');
    }

    /** Reject path — ไม่เครดิตวอลเล็ต */
    const uid3Row = await pool.query('SELECT gen_random_uuid() AS id');
    const uid3 = uid3Row.rows[0].id;
    cleanupIds.push(uid3);
    const p3 = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    await insertUser(pool, {
      id: uid3,
      email: `${RUN}_u3@fixture.local`,
      phone: p3,
      fb: `${RUN}_u3`,
    });
    const shaR = 'f'.repeat(64);
    const insR = await pool.query(
      `INSERT INTO manual_deposits (user_id, amount, slip_url, slip_sha256, status)
       VALUES ($1::uuid, 33.0, $2, $3, 'manual_pending_verification') RETURNING id`,
      [uid3, `https://example.invalid/reject1`, shaR]
    );
    const manualRejectId = insR.rows[0].id;
    const balR0 = Number(
      (await pool.query('SELECT wallet_balance FROM users WHERE id = $1::uuid', [uid3])).rows[0]
        .wallet_balance
    );
    const composed = composeManualRejectReasonRecord('NO_INBOUND_MATCH', 'int test');
    assert.equal(composed.ok, true);
    await pool.query(
      `UPDATE manual_deposits
       SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW(), reviewed_by = $3
       WHERE id = $1::uuid AND status = 'manual_pending_verification'`,
      [manualRejectId, composed.json, 'integration_reject']
    );
    const stR = (await pool.query('SELECT status, rejection_reason FROM manual_deposits WHERE id = $1::uuid', [manualRejectId]))
      .rows[0];
    assert.equal(String(stR.status), 'rejected');
    const payload = JSON.parse(stR.rejection_reason);
    assert.equal(payload.code, 'NO_INBOUND_MATCH');
    assert.ok(String(payload.message).length > 10);
    assert.equal(payload.internal_note, 'int test');
    const balR1 = Number(
      (await pool.query('SELECT wallet_balance FROM users WHERE id = $1::uuid', [uid3])).rows[0]
        .wallet_balance
    );
    assert.equal(balR1, balR0);

    console.log('OK test_wallet_manual_deposit_integration.js');
  } finally {
    await tearDown();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
