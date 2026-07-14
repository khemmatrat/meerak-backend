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
};

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
  const todayCompleted = mine.filter((j) => j.status === 'completed');
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

  let withdrawableMicro = earningsMicro;
  try {
    const profiles = JSON.parse(await fs.readFile(RIDERS_FILE, 'utf8'));
    const hit = profiles[riderId];
    if (hit?.earnings_micro != null) withdrawableMicro = hit.earnings_micro;
  } catch {
    /* optional */
  }

  return {
    rider_id: riderId,
    date: start.toISOString().slice(0, 10),
    online: presence?.online ?? false,
    gps_ok: presence?.lat != null && presence?.lng != null,
    presence,
    today: {
      earnings_micro: earningsMicro,
      trips: todayCompleted.length,
      active_jobs: todayActive.length,
      acceptance_rate: acceptanceRate,
      cancel_rate: cancelRate,
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
