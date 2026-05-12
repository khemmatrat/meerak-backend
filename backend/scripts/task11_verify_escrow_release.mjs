/**
 * Task 11 escrow release DB checks (no HTTP). Run: node scripts/task11_verify_escrow_release.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import {
  executeEscrowReleaseSettlement,
} from '../lib/paymentSettlementStateMachine.js';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const HAPPY = 'pmt_dbg10_1778152160383_7e9df9_order';
const RACE = 'pmt_dbg10_1778152160383_7e9df9_conc';
const OVERRIDE = 'pmt_dbg10_1778152160383_7e9df9_idem';
/** Never released below — reusable for §8 guard (pending job semantics). */
const GUARD_BLOCKED = 'pmt_dbg10_1778152160383_7e9df9_mismatch';

async function runTx(work) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await work(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function countReleased(paymentId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM ledger_entries
     WHERE payment_id = $1 AND event_type = 'ESCROW_RELEASED'`,
    [paymentId],
  );
  return r.rows[0].n;
}

async function ledgerOrder(paymentId) {
  const r = await pool.query(
    `SELECT event_type FROM ledger_entries
     WHERE payment_id = $1
       AND event_type IN ('PAYMENT_COMPLETED','ESCROW_HOLD','ESCROW_RELEASED')
     ORDER BY id ASC`,
    [paymentId],
  );
  return r.rows.map((x) => x.event_type);
}

async function escrowReleasedEvents(paymentId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM payment_escrow_events
     WHERE payment_id = $1 AND state = 'RELEASED'`,
    [paymentId],
  );
  return r.rows[0].n;
}

async function main() {
  // 8) Guard: synthetic job_ref not marked completed anywhere
  try {
    await runTx((c) =>
      executeEscrowReleaseSettlement(c, {
        paymentId: GUARD_BLOCKED,
        actor: 'verify',
        reason: 'guard',
        skipJobCompletionGuard: false,
      }),
    );
    throw new Error('expected ESCROW_RELEASE_JOB_NOT_COMPLETED');
  } catch (e) {
    assert(e.code === 'ESCROW_RELEASE_JOB_NOT_COMPLETED', `bad code ${e.code}`);
    assert((await countReleased(GUARD_BLOCKED)) === 0, 'guard leaked ledger row');
    assert((await escrowReleasedEvents(GUARD_BLOCKED)) === 0, 'guard leaked escrow event');
  }

  let r1;
  if ((await countReleased(HAPPY)) === 0) {
    r1 = await runTx((c) =>
      executeEscrowReleaseSettlement(c, {
        paymentId: HAPPY,
        actor: 'verify',
        reason: 'job completed bypass',
        skipJobCompletionGuard: true,
      }),
    );
    assert(r1.ok && !r1.idempotent && r1.ledger_entry_id, 'happy path');
  } else {
    r1 = { ok: true, idempotent: true, warm: true };
  }

  let orderTypes = await ledgerOrder(HAPPY);
  assert(
    JSON.stringify(orderTypes) ===
      JSON.stringify([
        'PAYMENT_COMPLETED',
        'ESCROW_HOLD',
        'ESCROW_RELEASED',
      ]),
    `ordering ${JSON.stringify(orderTypes)}`,
  );

  let r2 = await runTx((c) =>
    executeEscrowReleaseSettlement(c, {
      paymentId: HAPPY,
      actor: 'verify',
      reason: 'replay',
      skipJobCompletionGuard: true,
    }),
  );
  assert(r2.ok && r2.idempotent, 'replay');
  assert((await countReleased(HAPPY)) === 1, 'replay count');

  if ((await countReleased(OVERRIDE)) === 0) {
    const rO = await runTx((c) =>
      executeEscrowReleaseSettlement(c, {
        paymentId: OVERRIDE,
        actor: 'verify',
        reason: 'manual override',
        skipJobCompletionGuard: true,
      }),
    );
    assert(rO.ok && !rO.idempotent, 'override release');
  }
  const log = await pool.query(
    `SELECT action_type, reason FROM admin_actions_log
     WHERE payment_id = $1 AND action_type = 'escrow_release_settlement' ORDER BY id DESC LIMIT 1`,
    [OVERRIDE],
  );
  assert(
    log.rows[0]?.action_type === 'escrow_release_settlement',
    'admin log',
  );
  const beforeRace = await countReleased(RACE);
  if (beforeRace > 0) {
    assert(
      beforeRace === 1 &&
        (await escrowReleasedEvents(RACE)) === 1,
      'prior race invariant',
    );
  } else {
    const [a, b] = await Promise.all([
      runTx((c) =>
        executeEscrowReleaseSettlement(c, {
          paymentId: RACE,
          actor: 'race-a',
          reason: 'race-a',
          skipJobCompletionGuard: true,
        }),
      ).catch((e) => ({ err: e })),
      runTx((c) =>
        executeEscrowReleaseSettlement(c, {
          paymentId: RACE,
          actor: 'race-b',
          reason: 'race-b',
          skipJobCompletionGuard: true,
        }),
      ).catch((e) => ({ err: e })),
    ]);
    if (a?.err) throw a.err;
    if (b?.err) throw b.err;
    assert(a.ok && b.ok, 'race both ok');
    assert(
      (a.idempotent === true) !== (b.idempotent === true) || a.idempotent !== b.idempotent,
      'race one idempotent one fresh',
    );
    assert((await countReleased(RACE)) === 1, 'race ledger');
    assert((await escrowReleasedEvents(RACE)) === 1, 'race escrow_events');
  }

  console.log('task11_verify_escrow_release: all assertions passed');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
