/**
 * Rider OS credit line — ให้ยืมก่อน (ไม่ใช่เงินแจก)
 * credit_limit = วงเงินให้ยืม | credit_used = ยอดค้าง | cash_balance = ถอนได้หลังหักคืน
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/** 500 THB default line (catalog micro = satang, /100 = THB) */
export const DEFAULT_RIDER_CREDIT_LIMIT_MICRO = Number(
  process.env.RIDER_DEFAULT_CREDIT_LIMIT_MICRO || 50000,
);

const DATA_DIR = path.join(process.cwd(), '.data', 'dev');
const LEDGER_FILE = path.join(DATA_DIR, 'rider-credit-ledger.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'rider-credit-accounts.json');

export type RiderCreditEventType =
  | 'job_earning'
  | 'platform_fee'
  | 'withdraw_request'
  | 'withdraw_paid'
  | 'withdraw_rejected'
  | 'admin_credit'
  | 'admin_debit'
  | 'bonus'
  | 'penalty'
  | 'adjustment'
  | 'credit_line_open'
  | 'credit_limit_set'
  | 'credit_consume'
  | 'credit_repay'
  | 'credit_topup';

export type RiderCreditEntry = {
  id: string;
  rider_id: string;
  user_id: string;
  event_type: RiderCreditEventType;
  direction: 'credit' | 'debit';
  amount_micro: number;
  balance_after_micro?: number;
  job_id?: string;
  order_id?: string;
  payout_id?: string;
  idempotency_key?: string;
  reason: string;
  actor_type: string;
  actor_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type RiderCreditAccount = {
  rider_id: string;
  user_id: string;
  credit_limit_micro: number;
  credit_used_micro: number;
  cash_balance_micro: number;
  lifetime_earned_micro: number;
  completed_jobs: number;
  updated_at: string;
};

export type RiderCreditSummary = {
  rider_id: string;
  user_id: string;
  credit_limit_micro: number;
  credit_used_micro: number;
  available_credit_micro: number;
  cash_balance_micro: number;
  balance_micro: number;
  withdrawable_micro: number;
  pending_withdraw_micro: number;
  earned_micro: number;
  completed_jobs: number;
  source: string;
};

type LedgerStore = { entries: RiderCreditEntry[] };
type AccountStore = { accounts: Record<string, RiderCreditAccount> };

async function readLedger(): Promise<LedgerStore> {
  try {
    return JSON.parse(await fs.readFile(LEDGER_FILE, 'utf8')) as LedgerStore;
  } catch {
    return { entries: [] };
  }
}

async function writeLedger(store: LedgerStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function readAccounts(): Promise<AccountStore> {
  try {
    return JSON.parse(await fs.readFile(ACCOUNTS_FILE, 'utf8')) as AccountStore;
  } catch {
    return { accounts: {} };
  }
}

async function writeAccounts(store: AccountStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function availableCredit(acct: RiderCreditAccount) {
  return Math.max(0, acct.credit_limit_micro - acct.credit_used_micro);
}

function pendingWithdrawMicro(entries: RiderCreditEntry[], riderId: string) {
  const mine = entries.filter((e) => e.rider_id === riderId);
  return mine
    .filter((e) => e.event_type === 'withdraw_request')
    .filter((wr) => {
      const pid = String(wr.payout_id || wr.id);
      return !mine.some(
        (s) =>
          (s.event_type === 'withdraw_paid' || s.event_type === 'withdraw_rejected') &&
          String(s.metadata?.payout_id || s.payout_id || '') === pid,
      );
    })
    .reduce((s, e) => s + e.amount_micro, 0);
}

async function getOrCreateAccount(riderId: string, userId = ''): Promise<RiderCreditAccount> {
  const store = await readAccounts();
  let acct = store.accounts[riderId];
  if (!acct) {
    acct = {
      rider_id: riderId,
      user_id: userId,
      credit_limit_micro: 0,
      credit_used_micro: 0,
      cash_balance_micro: 0,
      lifetime_earned_micro: 0,
      completed_jobs: 0,
      updated_at: new Date().toISOString(),
    };
    store.accounts[riderId] = acct;
    await writeAccounts(store);
  }
  return acct;
}

async function saveAccount(acct: RiderCreditAccount) {
  const store = await readAccounts();
  acct.updated_at = new Date().toISOString();
  store.accounts[acct.rider_id] = acct;
  await writeAccounts(store);
}

async function appendEntry(
  input: Omit<RiderCreditEntry, 'id' | 'created_at'> & { id?: string },
): Promise<RiderCreditEntry> {
  const store = await readLedger();
  if (input.idempotency_key) {
    const dup = store.entries.find((e) => e.idempotency_key === input.idempotency_key);
    if (dup) return dup;
  }
  const entry: RiderCreditEntry = {
    id: input.id || `rcl-${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
    rider_id: input.rider_id,
    user_id: input.user_id || '',
    event_type: input.event_type,
    direction: input.direction,
    amount_micro: input.amount_micro,
    balance_after_micro: input.balance_after_micro,
    job_id: input.job_id,
    order_id: input.order_id,
    payout_id: input.payout_id,
    idempotency_key: input.idempotency_key,
    reason: input.reason || '',
    actor_type: input.actor_type || 'system',
    actor_id: input.actor_id,
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };
  store.entries.unshift(entry);
  await writeLedger(store);
  return entry;
}

export function jobCreditHoldMicro(jobAmountMicro: number, available: number): number {
  if (available <= 0) return 0;
  const base = Math.max(500, Math.round(Number(jobAmountMicro || 0) * 0.08));
  return Math.min(base, available);
}

export function riderJobEarningMicro(jobAmountMicro: number): number {
  return Math.max(1, Math.round(Number(jobAmountMicro || 0) * 0.18));
}

/** เปิดวงเงินเครดิตให้ยืม — เรียกตอนสมัคร Rider */
export async function openRiderCreditLine(
  riderId: string,
  userId: string,
  limitMicro = DEFAULT_RIDER_CREDIT_LIMIT_MICRO,
) {
  const idem = `credit-line-open-${riderId}`;
  const ledger = await readLedger();
  if (ledger.entries.some((e) => e.idempotency_key === idem)) {
    return getLocalRiderCreditSummary(riderId, userId);
  }

  const acct = await getOrCreateAccount(riderId, userId);
  acct.user_id = userId || acct.user_id;
  acct.credit_limit_micro = limitMicro;
  await saveAccount(acct);

  await appendEntry({
    rider_id: riderId,
    user_id: userId,
    event_type: 'credit_line_open',
    direction: 'credit',
    amount_micro: limitMicro,
    balance_after_micro: acct.cash_balance_micro,
    idempotency_key: idem,
    reason: `เปิดวงเงินเครดิตให้ยืม ${(limitMicro / 100).toFixed(2)} บาท`,
    actor_type: 'system',
    metadata: {
      credit_limit_micro: acct.credit_limit_micro,
      credit_used_micro: acct.credit_used_micro,
      available_credit_micro: availableCredit(acct),
    },
  });

  return getLocalRiderCreditSummary(riderId, userId);
}

/** ใช้เครดิตตอนรับงาน */
export async function consumeRiderCreditForJob(input: {
  rider_id: string;
  user_id?: string;
  job_id: string;
  order_id: string;
  job_amount_micro: number;
}) {
  const acct = await getOrCreateAccount(input.rider_id, input.user_id || '');
  const avail = availableCredit(acct);
  const hold = jobCreditHoldMicro(input.job_amount_micro, avail);
  if (hold <= 0) {
    const err = new Error('insufficient_credit');
    (err as Error & { code: string }).code = 'insufficient_credit';
    throw err;
  }

  acct.credit_used_micro += hold;
  await saveAccount(acct);

  await appendEntry({
    rider_id: input.rider_id,
    user_id: input.user_id || acct.user_id,
    event_type: 'credit_consume',
    direction: 'debit',
    amount_micro: hold,
    job_id: input.job_id,
    order_id: input.order_id,
    idempotency_key: `credit-consume-${input.job_id}`,
    reason: `ใช้เครดิตรับงาน #${input.order_id.slice(-8)}`,
    actor_type: 'rider',
    actor_id: input.rider_id,
    metadata: {
      job_amount_micro: input.job_amount_micro,
      credit_used_after: acct.credit_used_micro,
      available_credit_after: availableCredit(acct),
    },
  });

  return { hold_micro: hold, account: acct };
}

/** งานสำเร็จ — หักคืนเครดิตก่อน แล้วส่วนเกินเข้า cash */
export async function settleRiderJobEarning(input: {
  rider_id: string;
  user_id?: string;
  job_id: string;
  order_id: string;
  job_amount_micro: number;
}) {
  const idemEarn = `job-earn-${input.job_id}`;
  const ledger = await readLedger();
  if (ledger.entries.some((e) => e.idempotency_key === idemEarn)) {
    return getLocalRiderCreditSummary(input.rider_id, input.user_id);
  }

  const acct = await getOrCreateAccount(input.rider_id, input.user_id || '');
  const gross = riderJobEarningMicro(input.job_amount_micro);

  const consumeEntry = ledger.entries.find(
    (e) =>
      e.rider_id === input.rider_id &&
      e.event_type === 'credit_consume' &&
      e.job_id === input.job_id,
  );
  const holdMicro = consumeEntry?.amount_micro || 0;
  const repayMicro = Math.min(acct.credit_used_micro, holdMicro, gross);

  if (repayMicro > 0) {
    acct.credit_used_micro -= repayMicro;
    await appendEntry({
      rider_id: input.rider_id,
      user_id: input.user_id || acct.user_id,
      event_type: 'credit_repay',
      direction: 'credit',
      amount_micro: repayMicro,
      job_id: input.job_id,
      order_id: input.order_id,
      idempotency_key: `credit-repay-${input.job_id}`,
      reason: `หักคืนเครดิตจากงาน #${input.order_id.slice(-8)}`,
      actor_type: 'system',
      metadata: {
        gross_micro: gross,
        credit_used_after: acct.credit_used_micro,
      },
    });
  }

  const cashMicro = Math.max(0, gross - repayMicro);
  if (cashMicro > 0) {
    acct.cash_balance_micro += cashMicro;
    acct.lifetime_earned_micro += cashMicro;
    await appendEntry({
      rider_id: input.rider_id,
      user_id: input.user_id || acct.user_id,
      event_type: 'job_earning',
      direction: 'credit',
      amount_micro: cashMicro,
      balance_after_micro: acct.cash_balance_micro,
      job_id: input.job_id,
      order_id: input.order_id,
      idempotency_key: idemEarn,
      reason: `รายได้งาน #${input.order_id.slice(-8)} (หลังหักคืนเครดิต)`,
      actor_type: 'system',
      metadata: { gross_micro: gross, repaid_micro: repayMicro },
    });
  }

  acct.completed_jobs += 1;
  await saveAccount(acct);
  return getLocalRiderCreditSummary(input.rider_id, input.user_id);
}

/** Rider / Admin เติมเครดิต — คืนยอดค้างก่อน แล้วขยายวงเงิน */
export async function topupRiderCredit(input: {
  rider_id: string;
  user_id: string;
  amount_micro: number;
  reason: string;
  actor_type: 'rider' | 'admin';
  actor_id?: string;
  idempotency_key?: string;
}) {
  if (input.amount_micro <= 0) throw new Error('invalid_amount');

  if (input.idempotency_key) {
    const ledger = await readLedger();
    const key = input.idempotency_key;
    const dup = ledger.entries.find(
      (e) =>
        e.idempotency_key === key || String(e.idempotency_key || '').startsWith(`${key}-`),
    );
    if (dup) return getLocalRiderCreditSummary(input.rider_id, input.user_id);
  }

  const acct = await getOrCreateAccount(input.rider_id, input.user_id);
  const baseKey = input.idempotency_key || `topup-${input.rider_id}-${input.amount_micro}-${Date.now()}`;

  let remaining = input.amount_micro;
  const repayMicro = Math.min(acct.credit_used_micro, remaining);
  if (repayMicro > 0) {
    acct.credit_used_micro -= repayMicro;
    remaining -= repayMicro;
    await appendEntry({
      rider_id: input.rider_id,
      user_id: input.user_id,
      event_type: 'credit_repay',
      direction: 'credit',
      amount_micro: repayMicro,
      idempotency_key: `${baseKey}-repay`,
      reason: `${input.reason} — คืนเครดิตที่ใช้ไป`,
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      metadata: { via: 'credit_topup' },
    });
  }

  if (remaining > 0) {
    acct.credit_limit_micro += remaining;
    await appendEntry({
      rider_id: input.rider_id,
      user_id: input.user_id,
      event_type: 'credit_topup',
      direction: 'credit',
      amount_micro: remaining,
      idempotency_key: `${baseKey}-limit`,
      reason: input.reason,
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      metadata: {
        credit_limit_after: acct.credit_limit_micro,
        available_credit_after: availableCredit(acct),
        idempotency_group: baseKey,
      },
    });
  }

  await saveAccount(acct);
  return getLocalRiderCreditSummary(input.rider_id, input.user_id);
}

/** Admin ตั้งวงเงินเครดิต */
export async function adminSetRiderCreditLimit(input: {
  rider_id: string;
  user_id: string;
  credit_limit_micro: number;
  reason: string;
  admin_id: string;
}) {
  if (input.credit_limit_micro < 0) throw new Error('invalid_limit');
  const acct = await getOrCreateAccount(input.rider_id, input.user_id);
  if (input.credit_limit_micro < acct.credit_used_micro) {
    throw new Error('limit_below_used');
  }
  acct.credit_limit_micro = input.credit_limit_micro;
  await saveAccount(acct);

  await appendEntry({
    rider_id: input.rider_id,
    user_id: input.user_id,
    event_type: 'credit_limit_set',
    direction: 'credit',
    amount_micro: input.credit_limit_micro,
    reason: input.reason,
    actor_type: 'admin',
    actor_id: input.admin_id,
    metadata: {
      credit_limit_micro: acct.credit_limit_micro,
      credit_used_micro: acct.credit_used_micro,
    },
  });

  return getLocalRiderCreditSummary(input.rider_id, input.user_id);
}

export async function getLocalRiderCreditSummary(
  riderId: string,
  userId = '',
): Promise<RiderCreditSummary> {
  let acct = await getOrCreateAccount(riderId, userId);
  if (acct.credit_limit_micro === 0) {
    const ledger = await readLedger();
    const opened = ledger.entries.some(
      (e) => e.rider_id === riderId && e.event_type === 'credit_line_open',
    );
    if (!opened) {
      return openRiderCreditLine(riderId, userId);
    }
  }
  acct = await getOrCreateAccount(riderId, userId);
  const ledger = await readLedger();
  const pending = pendingWithdrawMicro(ledger.entries, riderId);
  const withdrawable = Math.max(0, acct.cash_balance_micro - pending);

  return {
    rider_id: riderId,
    user_id: userId || acct.user_id,
    credit_limit_micro: acct.credit_limit_micro,
    credit_used_micro: acct.credit_used_micro,
    available_credit_micro: availableCredit(acct),
    cash_balance_micro: acct.cash_balance_micro,
    balance_micro: acct.cash_balance_micro,
    withdrawable_micro: withdrawable,
    pending_withdraw_micro: pending,
    earned_micro: acct.lifetime_earned_micro,
    completed_jobs: acct.completed_jobs,
    source: 'local-rider-credits',
  };
}

export async function listLocalRiderCreditLedger(riderId: string, limit = 50) {
  const ledger = await readLedger();
  const entries = ledger.entries.filter((e) => e.rider_id === riderId).slice(0, limit);
  const summary = await getLocalRiderCreditSummary(riderId);
  return { summary, entries, total: entries.length, source: summary.source };
}

export async function createLocalRiderWithdraw(input: {
  rider_id: string;
  user_id?: string;
  amount_micro: number;
  bank_account?: string;
  idempotency_key?: string;
}) {
  if (input.idempotency_key) {
    const ledger = await readLedger();
    const dup = ledger.entries.find((e) => e.idempotency_key === input.idempotency_key);
    if (dup) {
      return {
        payout_id: String(dup.payout_id || dup.id),
        entry: dup,
        status: 'pending',
        duplicate: true,
      };
    }
  }

  const acct = await getOrCreateAccount(input.rider_id, input.user_id || '');
  const ledger = await readLedger();
  const pending = pendingWithdrawMicro(ledger.entries, input.rider_id);
  const withdrawable = Math.max(0, acct.cash_balance_micro - pending);
  const amount = input.amount_micro > 0 ? input.amount_micro : withdrawable;
  if (amount <= 0 || amount > withdrawable) {
    const err = new Error('insufficient_cash_balance');
    (err as Error & { code: string }).code = 'insufficient_cash_balance';
    throw err;
  }

  const payoutId = `payout-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const idemKey = input.idempotency_key || `withdraw-${payoutId}`;
  acct.cash_balance_micro -= amount;
  await saveAccount(acct);

  const entry = await appendEntry({
    rider_id: input.rider_id,
    user_id: input.user_id || acct.user_id,
    event_type: 'withdraw_request',
    direction: 'debit',
    amount_micro: amount,
    balance_after_micro: acct.cash_balance_micro,
    payout_id: payoutId,
    idempotency_key: idemKey,
    reason: 'คำขอถอนเงิน Rider OS',
    actor_type: 'rider',
    actor_id: input.rider_id,
    metadata: { bank_account: input.bank_account || '', status: 'pending', payout_id: payoutId },
  });

  return { payout_id: payoutId, entry, status: 'pending' };
}

/** @deprecated use topupRiderCredit / adminSetRiderCreditLimit */
export async function adminAdjustLocalRiderCredit(input: {
  rider_id: string;
  user_id: string;
  direction: 'credit' | 'debit';
  amount_micro: number;
  reason: string;
  admin_id: string;
}) {
  if (input.direction === 'credit') {
    return topupRiderCredit({
      rider_id: input.rider_id,
      user_id: input.user_id,
      amount_micro: input.amount_micro,
      reason: input.reason,
      actor_type: 'admin',
      actor_id: input.admin_id,
    });
  }
  const acct = await getOrCreateAccount(input.rider_id, input.user_id);
  const reduce = Math.min(input.amount_micro, acct.credit_limit_micro - acct.credit_used_micro);
  if (reduce <= 0) throw new Error('cannot_reduce_limit');
  acct.credit_limit_micro -= reduce;
  await saveAccount(acct);
  await appendEntry({
    rider_id: input.rider_id,
    user_id: input.user_id,
    event_type: 'credit_limit_set',
    direction: 'debit',
    amount_micro: reduce,
    reason: input.reason,
    actor_type: 'admin',
    actor_id: input.admin_id,
  });
  return getLocalRiderCreditSummary(input.rider_id, input.user_id);
}

/** @deprecated use settleRiderJobEarning */
export async function creditLocalJobEarning(input: {
  rider_id: string;
  user_id?: string;
  job_id: string;
  order_id: string;
  amount_micro: number;
}) {
  return settleRiderJobEarning({
    rider_id: input.rider_id,
    user_id: input.user_id,
    job_id: input.job_id,
    order_id: input.order_id,
    job_amount_micro: input.amount_micro,
  });
}

export function localRiderCreditLedgerPath() {
  return LEDGER_FILE;
}

export async function readLocalRiderCreditLedgerFile() {
  return readLedger();
}
