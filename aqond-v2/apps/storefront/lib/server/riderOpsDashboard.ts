import fs from 'fs/promises';
import path from 'path';
import { CREDIT_LOW_THRESHOLD_PCT, computeCreditRemainingPct } from '@/lib/riderCreditLedger';

const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');
const LEDGER_FILE = path.join(process.cwd(), '.data', 'dev', 'rider-credit-ledger.json');
const ACCOUNTS_FILE = path.join(process.cwd(), '.data', 'dev', 'rider-credit-accounts.json');

const STUCK_MS = 90 * 60 * 1000;

type JobRow = {
  id: string;
  order_id: string;
  rider_id?: string;
  merchant_name?: string;
  status: string;
  phase: string;
  job_type?: string;
  updated_at?: string;
};

type LedgerEntry = {
  rider_id: string;
  event_type: string;
  amount_micro: number;
  payout_id?: string;
  id?: string;
  created_at: string;
};

type AccountRow = {
  rider_id: string;
  credit_limit_micro: number;
  credit_used_micro: number;
};

export type RiderOpsSummary = {
  pending_withdrawals: Array<{
    rider_id: string;
    payout_id: string;
    amount_micro: number;
    created_at: string;
  }>;
  credit_stressed: Array<{
    rider_id: string;
    available_pct: number;
    credit_used_micro: number;
    credit_limit_micro: number;
  }>;
  stuck_jobs: Array<{
    id: string;
    order_id: string;
    rider_id?: string;
    phase: string;
    status: string;
    merchant_name?: string;
    idle_minutes: number;
  }>;
  counts: {
    pending_withdrawals: number;
    credit_stressed: number;
    stuck_jobs: number;
  };
  source: string;
};

export async function getRiderOpsSummary(): Promise<RiderOpsSummary> {
  let jobs: JobRow[] = [];
  let entries: LedgerEntry[] = [];
  let accounts: Record<string, AccountRow> = {};

  try {
    jobs = (JSON.parse(await fs.readFile(JOBS_FILE, 'utf8')).jobs || []) as JobRow[];
  } catch {
    /* optional */
  }
  try {
    entries = (JSON.parse(await fs.readFile(LEDGER_FILE, 'utf8')).entries || []) as LedgerEntry[];
  } catch {
    /* optional */
  }
  try {
    accounts = (JSON.parse(await fs.readFile(ACCOUNTS_FILE, 'utf8')).accounts || {}) as Record<
      string,
      AccountRow
    >;
  } catch {
    /* optional */
  }

  const now = Date.now();

  const pendingWithdrawals = entries
    .filter((e) => e.event_type === 'withdraw_request')
    .filter((wr) => {
      const pid = String(wr.payout_id || wr.id || '');
      return !entries.some(
        (s) =>
          (s.event_type === 'withdraw_paid' || s.event_type === 'withdraw_rejected') &&
          String(s.payout_id || '') === pid,
      );
    })
    .map((e) => ({
      rider_id: e.rider_id,
      payout_id: String(e.payout_id || e.id || ''),
      amount_micro: e.amount_micro,
      created_at: e.created_at,
    }));

  const creditStressed = Object.values(accounts)
    .map((a) => {
      const available = Math.max(0, a.credit_limit_micro - a.credit_used_micro);
      const pct = computeCreditRemainingPct(available, a.credit_limit_micro);
      return {
        rider_id: a.rider_id,
        available_pct: pct,
        credit_used_micro: a.credit_used_micro,
        credit_limit_micro: a.credit_limit_micro,
      };
    })
    .filter((r) => r.credit_limit_micro > 0 && r.available_pct < CREDIT_LOW_THRESHOLD_PCT)
    .sort((a, b) => a.available_pct - b.available_pct);

  const stuckJobs = jobs
    .filter((j) => j.status === 'assigned' || j.status === 'active')
    .map((j) => {
      const updated = j.updated_at ? new Date(j.updated_at).getTime() : now;
      const idleMin = Math.round((now - updated) / 60000);
      return { job: j, idleMin, idleMs: now - updated };
    })
    .filter((x) => x.idleMs >= STUCK_MS)
    .map((x) => ({
      id: x.job.id,
      order_id: x.job.order_id,
      rider_id: x.job.rider_id,
      phase: x.job.phase,
      status: x.job.status,
      merchant_name: x.job.merchant_name,
      idle_minutes: x.idleMin,
    }));

  return {
    pending_withdrawals: pendingWithdrawals.slice(0, 20),
    credit_stressed: creditStressed.slice(0, 20),
    stuck_jobs: stuckJobs.slice(0, 20),
    counts: {
      pending_withdrawals: pendingWithdrawals.length,
      credit_stressed: creditStressed.length,
      stuck_jobs: stuckJobs.length,
    },
    source: 'local-rider-ops',
  };
}
