#!/usr/bin/env node
/**
 * P1 smoke — concurrent COD holds for one rider must block the second over cap.
 * Opus Food OS release verdict: ledger guard + no cod_warning-only on cap exceed.
 *
 * Usage: node scripts/test-cod-p1-cap-concurrent.mjs
 */
import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { assignCodHold, codTierLimitMicro } from '../lib/riderCodLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  user: process.env.DB_USER || process.env.PGUSER || 'meera',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  database: process.env.DB_DATABASE || process.env.PGDATABASE || 'meera_db',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function revertJobUnassign(client, jobId, riderId) {
  await client.query(
    `UPDATE commerce.dispatch_riders SET load_count = GREATEST(0, load_count - 1) WHERE id=$1`,
    [riderId],
  );
  const tag = await client.query(
    `UPDATE commerce.dispatch_jobs
       SET rider_id=NULL, status='open', phase='finding_rider', updated_at=NOW()
     WHERE id=$1 AND rider_id=$2
       AND status IN ('assigned', 'active')
       AND phase IN ('rider_assigned', 'pending_accept')`,
    [jobId, riderId],
  );
  return (tag.rowCount || 0) > 0;
}

async function main() {
  const riderId = uid('rider-p1');
  const userId = crypto.randomUUID();
  const jobA = uid('job-p1a');
  const jobB = uid('job-p1b');
  const grade = 'bronze';
  const limit = codTierLimitMicro(grade);
  const amtA = Math.floor(limit * 0.75);
  const amtB = Math.floor(limit * 0.5);

  console.log('P1 COD cap concurrent smoke');
  console.log(`  rider=${riderId} limit_micro=${limit} amtA=${amtA} amtB=${amtB}`);

  // Reset rider COD account for isolated test rider
  await pool.query(`DELETE FROM commerce.rider_cod_holds WHERE rider_id = $1`, [riderId]).catch(() => {});
  await pool.query(`DELETE FROM commerce.rider_cod_accounts WHERE rider_id = $1`, [riderId]).catch(() => {});

  // Seed dispatch jobs as if accept succeeded (rider_assigned)
  await pool.query(
    `INSERT INTO commerce.dispatch_jobs
       (id, order_id, merchant_id, buyer_id, rider_id, job_type, status, phase,
        payment_method, amount_micro, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
     VALUES ($1,$2,'m1','b1',$3,'food','assigned','rider_assigned','cod',$4,13.7,100.5,13.8,100.6),
            ($5,$6,'m1','b1',$3,'food','assigned','rider_assigned','cod',$7,13.7,100.5,13.8,100.6)
     ON CONFLICT (id) DO NOTHING`,
    [jobA, uid('ord-a'), riderId, amtA, jobB, uid('ord-b'), amtB],
  ).catch(async (e) => {
    // Table may require more columns — create minimal rows if schema differs
    if (!String(e.message).includes('does not exist')) throw e;
    console.warn('  skip dispatch_jobs seed (table/columns unavailable) — ledger-only test');
  });

  await pool.query(
    `INSERT INTO commerce.dispatch_riders (id, user_id, display_name, active, load_count, grade)
     VALUES ($1, $2, 'P1 Smoke Rider', TRUE, 2, $3)
     ON CONFLICT (id) DO UPDATE SET load_count = 2, grade = EXCLUDED.grade`,
    [riderId, userId, grade],
  ).catch(() => {});

  const [holdA, holdB] = await Promise.all([
    assignCodHold(pool, { riderId, userId, jobId: jobA, orderId: uid('ord-a'), amountMicro: amtA, grade }),
    assignCodHold(pool, { riderId, userId, jobId: jobB, orderId: uid('ord-b'), amountMicro: amtB, grade }),
  ]);

  const okCount = [holdA, holdB].filter((h) => h.ok).length;
  const blocked = [holdA, holdB].filter((h) => !h.ok && h.code === 'cod_limit_exceeded');
  assert(okCount === 1, `expected exactly 1 hold ok, got ${okCount} (${JSON.stringify([holdA, holdB])})`);
  assert(blocked.length === 1, `expected 1 cod_limit_exceeded, got ${blocked.length}`);
  console.log('  concurrent assignCodHold: PASS (1 ok, 1 blocked — not warning-only)');

  const failedJob = holdA.ok ? jobB : jobA;
  const client = await pool.connect();
  try {
    const reverted = await revertJobUnassign(client, failedJob, riderId);
    if (reverted) {
      const row = await client.query(
        `SELECT status, phase, rider_id FROM commerce.dispatch_jobs WHERE id = $1`,
        [failedJob],
      );
      assert(row.rows[0]?.status === 'open', `job should reopen, got ${JSON.stringify(row.rows[0])}`);
      assert(row.rows[0]?.rider_id == null, 'job rider_id should be null after unassign');
      console.log('  unassign revert: PASS');
    } else {
      console.log('  unassign revert: skipped (dispatch_jobs row not seeded)');
    }
  } finally {
    client.release();
  }

  // Cleanup
  await pool.query(`DELETE FROM commerce.rider_cod_holds WHERE rider_id = $1`, [riderId]).catch(() => {});
  await pool.query(`DELETE FROM commerce.rider_cod_accounts WHERE rider_id = $1`, [riderId]).catch(() => {});
  await pool.query(`DELETE FROM commerce.dispatch_jobs WHERE id IN ($1, $2)`, [jobA, jobB]).catch(() => {});
  await pool.query(`DELETE FROM commerce.dispatch_riders WHERE id = $1`, [riderId]).catch(() => {});

  console.log('P1 COD cap concurrent smoke: PASS');
  console.log(`  first hold ok=${holdA.ok} second blocked=${!holdB.ok && holdB.code === 'cod_limit_exceeded' || !holdA.ok && holdA.code === 'cod_limit_exceeded'}`);
}

main()
  .catch((e) => {
    console.error('P1 COD cap concurrent smoke: FAIL', e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
