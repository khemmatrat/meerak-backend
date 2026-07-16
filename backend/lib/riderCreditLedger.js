/**
 * Rider OS credit ledger — SQL (commerce) + local JSON fallback for dev.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  buildLocalCreditSummary,
  listLocalCreditLedger,
  topupRiderCreditLocal,
  adminSetRiderCreditLimitLocal,
  openRiderCreditLineLocal,
  DEFAULT_RIDER_CREDIT_LIMIT_MICRO,
} from './riderCreditLine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_LEDGER_FILE =
  process.env.RIDER_CREDIT_LEDGER_FILE ||
  path.resolve(__dirname, '../../aqond-v2/apps/storefront/.data/dev/rider-credit-ledger.json');
const LOCAL_ACCOUNTS_FILE = path.resolve(
  __dirname,
  '../../aqond-v2/apps/storefront/.data/dev/rider-credit-accounts.json',
);

function newId(prefix = 'rcl') {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

async function readLocalStore() {
  try {
    const raw = await fs.readFile(LOCAL_LEDGER_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { entries: [] };
  }
}

async function writeLocalStore(store) {
  await fs.mkdir(path.dirname(LOCAL_LEDGER_FILE), { recursive: true });
  await fs.writeFile(LOCAL_LEDGER_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function sumLocalBalance(entries, riderId) {
  let balance = 0;
  for (const e of entries) {
    if (e.rider_id !== riderId) continue;
    balance += e.direction === 'credit' ? Number(e.amount_micro) : -Number(e.amount_micro);
  }
  return Math.max(0, balance);
}

async function appendLocalEntry(input) {
  const store = await readLocalStore();
  if (input.idempotency_key) {
    const dup = store.entries.find((e) => e.idempotency_key === input.idempotency_key);
    if (dup) return dup;
  }
  const balanceBefore = sumLocalBalance(store.entries, input.rider_id);
  if (input.direction === 'debit' && balanceBefore < input.amount_micro) {
    const err = new Error('insufficient_rider_balance');
    err.code = 'insufficient_rider_balance';
    throw err;
  }
  const delta = input.direction === 'credit' ? input.amount_micro : -input.amount_micro;
  const entry = {
    id: input.id || newId(),
    rider_id: input.rider_id,
    user_id: input.user_id || '',
    event_type: input.event_type,
    direction: input.direction,
    amount_micro: input.amount_micro,
    balance_after_micro: Math.max(0, balanceBefore + delta),
    job_id: input.job_id || null,
    order_id: input.order_id || null,
    payout_id: input.payout_id || null,
    idempotency_key: input.idempotency_key || null,
    reason: input.reason || '',
    actor_type: input.actor_type || 'system',
    actor_id: input.actor_id || null,
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };
  store.entries.unshift(entry);
  await writeLocalStore(store);
  return entry;
}

async function sqlLedgerAvailable(pool) {
  try {
    await pool.query(`SELECT 1 FROM commerce.rider_credit_ledger LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

async function sqlSumBalance(pool, riderId) {
  const q = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_micro ELSE -amount_micro END), 0)::bigint AS bal
       FROM commerce.rider_credit_ledger WHERE rider_id = $1`,
    [riderId],
  );
  return Math.max(0, Number(q.rows?.[0]?.bal || 0));
}

export async function appendRiderCreditEntry(pool, input) {
  const hasSql = await sqlLedgerAvailable(pool);
  if (hasSql) {
    if (input.idempotency_key) {
      const dup = await pool.query(
        `SELECT * FROM commerce.rider_credit_ledger WHERE idempotency_key = $1 LIMIT 1`,
        [input.idempotency_key],
      );
      if (dup.rows?.[0]) return dup.rows[0];
    }
    const balanceBefore = await sqlSumBalance(pool, input.rider_id);
    if (input.direction === 'debit' && balanceBefore < input.amount_micro) {
      const err = new Error('insufficient_rider_balance');
      err.code = 'insufficient_rider_balance';
      throw err;
    }
    const delta = input.direction === 'credit' ? input.amount_micro : -input.amount_micro;
    const id = input.id || newId();
    const q = await pool.query(
      `INSERT INTO commerce.rider_credit_ledger
        (id, rider_id, user_id, event_type, direction, amount_micro, balance_after_micro,
         job_id, order_id, payout_id, idempotency_key, reason, actor_type, actor_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       RETURNING *`,
      [
        id,
        input.rider_id,
        input.user_id || '',
        input.event_type,
        input.direction,
        input.amount_micro,
        Math.max(0, balanceBefore + delta),
        input.job_id || null,
        input.order_id || null,
        input.payout_id || null,
        input.idempotency_key || null,
        input.reason || '',
        input.actor_type || 'system',
        input.actor_id || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return q.rows[0];
  }
  return appendLocalEntry(input);
}

export async function getRiderCreditSummary(pool, riderId, userId = '') {
  const hasSql = await sqlLedgerAvailable(pool);
  if (hasSql) {
    try {
      const acctQ = await pool.query(
        `SELECT * FROM commerce.rider_credit_accounts WHERE rider_id = $1 LIMIT 1`,
        [riderId],
      );
      if (acctQ.rows?.[0]) {
        const acct = acctQ.rows[0];
        const pendingQ = await pool.query(
          `SELECT COALESCE(SUM(wr.amount_micro), 0)::bigint AS pending_micro
             FROM commerce.rider_credit_ledger wr
            WHERE wr.rider_id = $1 AND wr.event_type = 'withdraw_request'
              AND NOT EXISTS (
                SELECT 1 FROM commerce.rider_credit_ledger s
                 WHERE s.rider_id = wr.rider_id
                   AND s.event_type IN ('withdraw_paid','withdraw_rejected')
                   AND COALESCE(s.payout_id, s.metadata->>'payout_id') = COALESCE(wr.payout_id, wr.id::text)
              )`,
          [riderId],
        );
        const cash = Math.max(0, Number(acct.cash_balance_micro || 0));
        const pending = Number(pendingQ.rows?.[0]?.pending_micro || 0);
        const limit = Number(acct.credit_limit_micro || 0);
        const used = Number(acct.credit_used_micro || 0);
        return {
          rider_id: riderId,
          user_id: userId || acct.user_id,
          credit_limit_micro: limit,
          credit_used_micro: used,
          available_credit_micro: Math.max(0, limit - used),
          cash_balance_micro: cash,
          balance_micro: cash,
          withdrawable_micro: Math.max(0, cash - pending),
          pending_withdraw_micro: pending,
          earned_micro: Number(acct.lifetime_earned_micro || 0),
          completed_jobs: Number(acct.completed_jobs || 0),
          source: 'commerce.rider_credit_accounts',
        };
      }
    } catch {
      /* fall through */
    }
  }

  try {
    await fs.access(LOCAL_ACCOUNTS_FILE);
    return buildLocalCreditSummary(riderId, userId);
  } catch {
    /* legacy ledger-only */
  }

  if (hasSql) {
    const [balQ, earnQ, pendQ] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_micro ELSE -amount_micro END), 0)::bigint AS balance_micro
           FROM commerce.rider_credit_ledger WHERE rider_id = $1`,
        [riderId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount_micro), 0)::bigint AS earned_micro,
                COUNT(*)::int AS completed_jobs
           FROM commerce.rider_credit_ledger
          WHERE rider_id = $1 AND event_type = 'job_earning' AND direction = 'credit'`,
        [riderId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(wr.amount_micro), 0)::bigint AS pending_micro
           FROM commerce.rider_credit_ledger wr
          WHERE wr.rider_id = $1 AND wr.event_type = 'withdraw_request'
            AND NOT EXISTS (
              SELECT 1 FROM commerce.rider_credit_ledger s
               WHERE s.rider_id = wr.rider_id
                 AND s.event_type IN ('withdraw_paid','withdraw_rejected')
                 AND COALESCE(s.payout_id, s.metadata->>'payout_id') = COALESCE(wr.payout_id, wr.id)
            )`,
        [riderId],
      ),
    ]);
    const balanceMicro = Math.max(0, Number(balQ.rows?.[0]?.balance_micro || 0));
    return {
      rider_id: riderId,
      user_id: userId,
      credit_limit_micro: 0,
      credit_used_micro: 0,
      available_credit_micro: 0,
      cash_balance_micro: balanceMicro,
      balance_micro: balanceMicro,
      withdrawable_micro: balanceMicro,
      pending_withdraw_micro: Number(pendQ.rows?.[0]?.pending_micro || 0),
      earned_micro: Number(earnQ.rows?.[0]?.earned_micro || 0),
      completed_jobs: Number(earnQ.rows?.[0]?.completed_jobs || 0),
      source: 'commerce.rider_credit_ledger',
    };
  }

  const store = await readLocalStore();
  const mine = store.entries.filter((e) => e.rider_id === riderId);
  const balanceMicro = sumLocalBalance(store.entries, riderId);
  const earnedMicro = mine
    .filter((e) => e.event_type === 'job_earning' && e.direction === 'credit')
    .reduce((s, e) => s + Number(e.amount_micro), 0);
  const pendingWithdraw = mine
    .filter((e) => e.event_type === 'withdraw_request')
    .filter((wr) => {
      const pid = String(wr.payout_id || wr.id);
      return !mine.some(
        (s) =>
          (s.event_type === 'withdraw_paid' || s.event_type === 'withdraw_rejected') &&
          String(s.metadata?.payout_id || s.payout_id || '') === pid,
      );
    })
    .reduce((s, e) => s + Number(e.amount_micro), 0);

  return {
    rider_id: riderId,
    user_id: userId,
    credit_limit_micro: 0,
    credit_used_micro: 0,
    available_credit_micro: 0,
    cash_balance_micro: balanceMicro,
    balance_micro: balanceMicro,
    withdrawable_micro: balanceMicro,
    pending_withdraw_micro: pendingWithdraw,
    earned_micro: earnedMicro,
    completed_jobs: mine.filter((e) => e.event_type === 'job_earning').length,
    source: 'local-rider-credits',
  };
}

export async function listRiderCreditLedger(pool, riderId, limit = 50) {
  try {
    await fs.access(LOCAL_ACCOUNTS_FILE);
    return listLocalCreditLedger(riderId, limit);
  } catch {
    /* sql or legacy */
  }
  const hasSql = await sqlLedgerAvailable(pool);
  let entries = [];
  if (hasSql) {
    const q = await pool.query(
      `SELECT * FROM commerce.rider_credit_ledger
        WHERE rider_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [riderId, limit],
    );
    entries = q.rows || [];
  } else {
    const store = await readLocalStore();
    entries = store.entries.filter((e) => e.rider_id === riderId).slice(0, limit);
  }
  const summary = await getRiderCreditSummary(pool, riderId);
  return { summary, entries, total: entries.length, source: summary.source };
}

export async function adminAdjustRiderCredit(pool, input) {
  if (input.direction === 'credit') {
    return topupRiderCreditLocal({
      rider_id: input.rider_id,
      user_id: input.user_id,
      amount_micro: input.amount_micro,
      reason: input.reason,
      actor_type: 'admin',
      actor_id: input.admin_id,
    });
  }
  const current = await buildLocalCreditSummary(input.rider_id, input.user_id);
  const newLimit = Math.max(
    Number(current.credit_used_micro || 0),
    Number(current.credit_limit_micro || 0) - input.amount_micro,
  );
  return adminSetRiderCreditLimitLocal({
    rider_id: input.rider_id,
    user_id: input.user_id,
    credit_limit_micro: newLimit,
    reason: input.reason,
    admin_id: input.admin_id,
  });
}

export async function adminSetRiderCreditLimit(pool, input) {
  const hasSql = await sqlLedgerAvailable(pool);
  if (hasSql) {
    /* TODO: SQL upsert — local JSON for dev */
  }
  return adminSetRiderCreditLimitLocal(input);
}

export async function riderCreditTopup(pool, input) {
  return topupRiderCreditLocal(input);
}

export async function openRiderCreditLine(pool, riderId, userId, limitMicro) {
  const hasSql = await sqlLedgerAvailable(pool);
  if (hasSql) {
    try {
      await pool.query(
        `INSERT INTO commerce.rider_credit_accounts (rider_id, user_id, credit_limit_micro)
         VALUES ($1, $2, $3)
         ON CONFLICT (rider_id) DO UPDATE SET credit_limit_micro = GREATEST(commerce.rider_credit_accounts.credit_limit_micro, EXCLUDED.credit_limit_micro), updated_at = NOW()`,
        [riderId, userId, limitMicro || DEFAULT_RIDER_CREDIT_LIMIT_MICRO],
      );
    } catch {
      /* table may not exist yet */
    }
  }
  return openRiderCreditLineLocal(riderId, userId, limitMicro);
}

export { openRiderCreditLineLocal, buildLocalCreditSummary };

export async function writeRiderFinancialAudit(pool, input) {
  try {
    await pool.query(
      `INSERT INTO financial_audit_log
        (actor_type, actor_id, action, entity_type, entity_id, reason, state_after, correlation_id)
       VALUES ('admin', $1, $2, 'dispatch_rider', $3, $4, $5::jsonb, $6)`,
      [
        input.admin_id,
        input.action,
        input.rider_id,
        input.reason,
        JSON.stringify(input.state_after || {}),
        input.correlation_id || input.rider_id,
      ],
    );
  } catch (e) {
    console.warn('[riderCreditLedger] financial_audit_log insert failed:', e?.message);
  }
}

export async function resolveRiderIdForUser(pool, userId, token = '') {
  try {
    const q = await pool.query(
      `SELECT id AS rider_id, user_id, display_name, phone, plate, kyc_status, active, suspended, earnings_micro
         FROM commerce.dispatch_riders WHERE user_id = $1::text LIMIT 1`,
      [String(userId)],
    );
    if (q.rows?.[0]) return q.rows[0];
  } catch {
    /* optional schema */
  }

  try {
    const store = await readLocalStore();
    const ridersFile = path.resolve(__dirname, '../../aqond-v2/apps/storefront/.data/dev/dispatch-riders.json');
    const raw = await fs.readFile(ridersFile, 'utf8');
    const riders = JSON.parse(raw).riders || [];
    const hit = riders.find((r) => r.user_id === String(userId));
    if (hit) return hit;
  } catch {
    /* no local riders */
  }
  return null;
}
