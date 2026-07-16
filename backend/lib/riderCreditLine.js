import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../aqond-v2/apps/storefront/.data/dev');
const LEDGER_FILE = process.env.RIDER_CREDIT_LEDGER_FILE || path.join(DATA_DIR, 'rider-credit-ledger.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'rider-credit-accounts.json');

export const DEFAULT_RIDER_CREDIT_LIMIT_MICRO = Number(process.env.RIDER_DEFAULT_CREDIT_LIMIT_MICRO || 50000);

async function readLedger() {
  try {
    return JSON.parse(await fs.readFile(LEDGER_FILE, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

async function writeLedger(store) {
  await fs.mkdir(path.dirname(LEDGER_FILE), { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function readAccounts() {
  try {
    return JSON.parse(await fs.readFile(ACCOUNTS_FILE, 'utf8'));
  } catch {
    return { accounts: {} };
  }
}

async function writeAccounts(store) {
  await fs.mkdir(path.dirname(ACCOUNTS_FILE), { recursive: true });
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function availableCredit(acct) {
  return Math.max(0, Number(acct.credit_limit_micro || 0) - Number(acct.credit_used_micro || 0));
}

function newId(prefix = 'rcl') {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

async function getOrCreateAccount(riderId, userId = '') {
  const store = await readAccounts();
  if (!store.accounts[riderId]) {
    store.accounts[riderId] = {
      rider_id: riderId,
      user_id: userId,
      credit_limit_micro: 0,
      credit_used_micro: 0,
      cash_balance_micro: 0,
      lifetime_earned_micro: 0,
      completed_jobs: 0,
      updated_at: new Date().toISOString(),
    };
    await writeAccounts(store);
  }
  return store.accounts[riderId];
}

async function saveAccount(acct) {
  const store = await readAccounts();
  acct.updated_at = new Date().toISOString();
  store.accounts[acct.rider_id] = acct;
  await writeAccounts(store);
}

async function appendEntry(input) {
  const store = await readLedger();
  if (input.idempotency_key) {
    const dup = store.entries.find((e) => e.idempotency_key === input.idempotency_key);
    if (dup) return dup;
  }
  const entry = {
    id: input.id || newId(),
    rider_id: input.rider_id,
    user_id: input.user_id || '',
    event_type: input.event_type,
    direction: input.direction,
    amount_micro: input.amount_micro,
    balance_after_micro: input.balance_after_micro,
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
  await writeLedger(store);
  return entry;
}

function pendingWithdrawMicro(entries, riderId) {
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
    .reduce((s, e) => s + Number(e.amount_micro), 0);
}

export function jobCreditHoldMicro(jobAmountMicro, available) {
  if (available <= 0) return 0;
  const base = Math.max(500, Math.round(Number(jobAmountMicro || 0) * 0.08));
  return Math.min(base, available);
}

export function riderJobEarningMicro(jobAmountMicro) {
  return Math.max(1, Math.round(Number(jobAmountMicro || 0) * 0.18));
}

export async function buildLocalCreditSummary(riderId, userId = '') {
  const acct = await getOrCreateAccount(riderId, userId);
  const ledger = await readLedger();
  const pending = pendingWithdrawMicro(ledger.entries, riderId);
  const cash = Number(acct.cash_balance_micro || 0);
  return {
    rider_id: riderId,
    user_id: userId || acct.user_id,
    credit_limit_micro: Number(acct.credit_limit_micro || 0),
    credit_used_micro: Number(acct.credit_used_micro || 0),
    available_credit_micro: availableCredit(acct),
    cash_balance_micro: cash,
    balance_micro: cash,
    withdrawable_micro: Math.max(0, cash - pending),
    pending_withdraw_micro: pending,
    earned_micro: Number(acct.lifetime_earned_micro || 0),
    completed_jobs: Number(acct.completed_jobs || 0),
    source: 'local-rider-credits',
  };
}

export async function openRiderCreditLineLocal(riderId, userId, limitMicro = DEFAULT_RIDER_CREDIT_LIMIT_MICRO) {
  const idem = `credit-line-open-${riderId}`;
  const ledger = await readLedger();
  if (ledger.entries.some((e) => e.idempotency_key === idem)) {
    return buildLocalCreditSummary(riderId, userId);
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
    metadata: { credit_limit_micro: acct.credit_limit_micro, credit_used_micro: acct.credit_used_micro },
  });
  return buildLocalCreditSummary(riderId, userId);
}

export async function topupRiderCreditLocal(input) {
  const acct = await getOrCreateAccount(input.rider_id, input.user_id);
  let remaining = input.amount_micro;
  const repay = Math.min(Number(acct.credit_used_micro || 0), remaining);
  if (repay > 0) {
    acct.credit_used_micro -= repay;
    remaining -= repay;
    await appendEntry({
      rider_id: input.rider_id,
      user_id: input.user_id,
      event_type: 'credit_repay',
      direction: 'credit',
      amount_micro: repay,
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
      reason: input.reason,
      actor_type: input.actor_type,
      actor_id: input.actor_id,
    });
  }
  await saveAccount(acct);
  return buildLocalCreditSummary(input.rider_id, input.user_id);
}

export async function adminSetRiderCreditLimitLocal(input) {
  const acct = await getOrCreateAccount(input.rider_id, input.user_id);
  if (input.credit_limit_micro < Number(acct.credit_used_micro || 0)) {
    const err = new Error('limit_below_used');
    err.code = 'limit_below_used';
    throw err;
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
  });
  return buildLocalCreditSummary(input.rider_id, input.user_id);
}

export async function listLocalCreditLedger(riderId, limit = 50) {
  const ledger = await readLedger();
  const entries = ledger.entries.filter((e) => e.rider_id === riderId).slice(0, limit);
  const summary = await buildLocalCreditSummary(riderId);
  return { summary, entries, total: entries.length, source: summary.source };
}
