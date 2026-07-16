import fs from 'fs/promises';
import path from 'path';
import { getRiderPresence } from '@/lib/server/riderPresence';

const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');
const RIDERS_FILE = path.join(process.cwd(), '.data', 'dev', 'rider-profiles.json');

type JobRow = {
  id: string;
  order_id: string;
  rider_id?: string;
  status: string;
  phase: string;
  amount_micro?: number;
  updated_at?: string;
};

function weekStartBangkok(): Date {
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = bangkok.getDay();
  const diff = day === 0 ? 6 : day - 1;
  bangkok.setDate(bangkok.getDate() - diff);
  bangkok.setHours(0, 0, 0, 0);
  const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getTime();
  return new Date(bangkok.getTime() + offset);
}

function todayStartBangkok(): Date {
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  bangkok.setHours(0, 0, 0, 0);
  const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getTime();
  return new Date(bangkok.getTime() + offset);
}

async function readJobs(): Promise<JobRow[]> {
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf8');
    return (JSON.parse(raw).jobs || []) as JobRow[];
  } catch {
    return [];
  }
}

export async function getRiderDashboard(riderId: string) {
  const jobs = await readJobs();
  const start = todayStartBangkok();
  const mine = jobs.filter((j) => j.rider_id === riderId);
  const todayCompleted = mine.filter((j) => {
    if (j.status !== 'completed') return false;
    if (!j.updated_at) return true;
    return new Date(j.updated_at) >= start;
  });
  const todayActive = mine.filter((j) => j.status === 'assigned' || j.status === 'active');
  const earningsMicro = todayCompleted.reduce(
    (s, j) => s + Math.round((j.amount_micro || 0) * 0.18),
    0,
  );

  const offered = jobs.filter(
    (j) => j.status === 'open' || j.phase === 'finding_rider' || j.phase === 'food_ready',
  ).length;
  const accepted = mine.length;
  const cancelled = mine.filter((j) => j.status === 'cancelled').length;
  const acceptanceRate =
    offered + accepted > 0 ? Math.round((accepted / Math.max(1, offered + accepted)) * 100) : 100;
  const cancelRate = accepted > 0 ? Math.round((cancelled / accepted) * 100) : 0;

  const presence = await getRiderPresence(riderId);
  const currentJob = todayActive[0] || null;

  const weekStart = weekStartBangkok();
  const weekCompleted = mine.filter((j) => {
    if (j.status !== 'completed') return false;
    const at = j.updated_at ? new Date(j.updated_at) : null;
    return at ? at >= weekStart : false;
  });
  const weekEarningsMicro = weekCompleted.reduce(
    (s, j) => s + Math.round((j.amount_micro || 0) * 0.18),
    0,
  );

  const completedDates = mine
    .filter((j) => j.status === 'completed' && j.updated_at)
    .map((j) => j.updated_at as string);

  const { computeDeliveryStreak, computeRiderTier } = await import('@/lib/riderRetention');
  const streakDays = computeDeliveryStreak(completedDates);

  let lifetimeTrips = mine.filter((j) => j.status === 'completed').length;
  let avgRating: number | null = null;
  let withdrawableMicro = earningsMicro;

  try {
    const { getOrCreateAccount } = await import('@/lib/server/riderCreditLine');
    const acct = await getOrCreateAccount(riderId, '');
    lifetimeTrips = acct.completed_jobs;
    withdrawableMicro = acct.cash_balance_micro;
  } catch {
    /* optional */
  }

  try {
    const profiles = JSON.parse(await fs.readFile(RIDERS_FILE, 'utf8'));
    const hit = profiles[riderId];
    if (hit?.avg_rating != null) avgRating = Number(hit.avg_rating);
    if (hit?.earnings_micro != null) withdrawableMicro = hit.earnings_micro;
  } catch {
    /* optional */
  }

  const tier = computeRiderTier(lifetimeTrips, avgRating);

  return {
    rider_id: riderId,
    date: start.toISOString().slice(0, 10),
    online: presence?.online ?? false,
    availability: presence?.availability ?? (presence?.online ? 'online' : 'offline'),
    gps_ok: presence?.lat != null && presence?.lng != null,
    presence,
    today: {
      earnings_micro: earningsMicro,
      trips: todayCompleted.length,
      active_jobs: todayActive.length,
      acceptance_rate: acceptanceRate,
      cancel_rate: cancelRate,
    },
    week: {
      trips: weekCompleted.length,
      earnings_micro: weekEarningsMicro,
      week_start: weekStart.toISOString().slice(0, 10),
    },
    retention: {
      streak_days: streakDays,
      tier_id: tier.id,
      tier_label: tier.labelTh,
      completed_trips: lifetimeTrips,
      avg_rating: avgRating,
      trips_to_next_tier: tier.tripsToNext ?? null,
    },
    current_job: currentJob,
    wallet: {
      earnings_micro: withdrawableMicro,
      withdrawable_micro: withdrawableMicro,
      bonus_micro: 0,
    },
    source: 'local-dashboard',
  };
}
