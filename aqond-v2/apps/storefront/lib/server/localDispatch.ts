import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { listNearbyRestaurants } from '@/lib/server/localFood';
import { appendAqondEvent, dispatchPhaseToEvent } from '@/lib/server/aqondEventBus';
import type { DispatchJob } from '@/lib/server/dispatchSvc';

const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');

export type LocalDispatchJob = DispatchJob & {
  buyer_id?: string;
  job_type?: 'food' | 'parcel';
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  rider_id?: string;
  delivery_proof_url?: string;
  delivery_proof_at?: string;
  delivery_proof_lat?: number;
  delivery_proof_lng?: number;
  updated_at?: string;
};

type JobStore = { jobs: LocalDispatchJob[] };

async function readJobs(): Promise<JobStore> {
  try {
    return JSON.parse(await fs.readFile(JOBS_FILE, 'utf8')) as JobStore;
  } catch {
    return { jobs: [] };
  }
}

async function writeJobs(store: JobStore) {
  await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true });
  await fs.writeFile(JOBS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function coordsForMerchant(merchantId: string) {
  const restaurants = await listNearbyRestaurants();
  const hit = restaurants.find((r) => r.id === merchantId);
  if (hit?.lat != null && hit.lng != null) {
    return { lat: hit.lat, lng: hit.lng };
  }
  return { lat: 13.724 + Math.random() * 0.02, lng: 100.534 + Math.random() * 0.02 };
}

function dropoffNearPickup(pickup: { lat: number; lng: number }) {
  return {
    lat: pickup.lat + 0.008 + Math.random() * 0.006,
    lng: pickup.lng + 0.006 + Math.random() * 0.006,
  };
}

export async function localCreateDispatchJob(input: {
  order_id: string;
  merchant_id: string;
  buyer_id?: string;
  merchant_name?: string;
  items_summary?: string;
  address?: string;
  amount_micro?: number;
  payment_method?: string;
  fulfillment_phase?: string;
  job_type?: 'food' | 'parcel';
}): Promise<{ job: LocalDispatchJob; created: boolean }> {
  const store = await readJobs();
  const existing = store.jobs.find((j) => j.order_id === input.order_id && j.status !== 'cancelled');
  if (existing) return { job: existing, created: false };

  const pickup = await coordsForMerchant(input.merchant_id);
  const dropoff = dropoffNearPickup(pickup);
  const job: LocalDispatchJob = {
    id: `job-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    order_id: input.order_id,
    merchant_id: input.merchant_id,
    buyer_id: input.buyer_id,
    status: 'open',
    phase: input.fulfillment_phase === 'ready' ? 'food_ready' : 'finding_rider',
    merchant_name: input.merchant_name,
    items_summary: input.items_summary,
    address: input.address,
    amount_micro: input.amount_micro,
    payment_method: input.payment_method || 'cod',
    job_type: input.job_type || 'food',
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    updated_at: new Date().toISOString(),
  };
  store.jobs.unshift(job);
  await writeJobs(store);

  const base = Date.now();
  await appendAqondEvent({
    order_id: input.order_id,
    event_type: 'dispatch.search_started',
    source: 'dispatch-svc',
    job_id: job.id,
    merchant_id: input.merchant_id,
    payload: { local: true },
    at: new Date(base).toISOString(),
  });

  const demoOffers = [
    { rider_id: 'rider-demo-a', outcome: 'dispatch.rider_rejected' as const, delay: 1 },
    { rider_id: 'rider-demo-b', outcome: 'dispatch.rider_timeout' as const, delay: 2 },
  ];
  for (const offer of demoOffers) {
    await appendAqondEvent({
      order_id: input.order_id,
      event_type: 'dispatch.rider_offered',
      source: 'dispatch-svc',
      job_id: job.id,
      rider_id: offer.rider_id,
      merchant_id: input.merchant_id,
      at: new Date(base + offer.delay * 1000).toISOString(),
    });
    await appendAqondEvent({
      order_id: input.order_id,
      event_type: offer.outcome,
      source: 'dispatch-svc',
      job_id: job.id,
      rider_id: offer.rider_id,
      merchant_id: input.merchant_id,
      at: new Date(base + offer.delay * 1000 + 500).toISOString(),
    });
  }

  return { job, created: true };
}

export async function localListDispatchJobs(opts: { rider_id?: string; status?: string }) {
  const store = await readJobs();
  let jobs = store.jobs;
  if (opts.status === 'open') {
    jobs = jobs.filter((j) => j.status === 'open');
  } else if (opts.rider_id) {
    jobs = jobs.filter((j) => j.rider_id === opts.rider_id && j.status !== 'completed');
  }
  return { jobs, source: 'local-dispatch' };
}

export async function localAcceptDispatchJob(jobId: string, riderId: string) {
  const store = await readJobs();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'open') return null;

  try {
    const { consumeRiderCreditForJob } = await import('@/lib/server/riderCreditLine');
    await consumeRiderCreditForJob({
      rider_id: riderId,
      job_id: job.id,
      order_id: job.order_id,
      job_amount_micro: job.amount_micro || 0,
    });
  } catch (e: unknown) {
    const code = e instanceof Error && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code === 'insufficient_credit') {
      return { error: 'insufficient_credit', message: 'เครดิตไม่พอรับงาน — เติมเครดิตหรือส่งงานให้ครบเพื่อหักคืน' } as const;
    }
    throw e;
  }

  job.status = 'assigned';
  job.phase = 'rider_assigned';
  job.rider_id = riderId;
  job.updated_at = new Date().toISOString();
  await writeJobs(store);

  await appendAqondEvent({
    order_id: job.order_id,
    event_type: 'dispatch.rider_accepted',
    source: 'dispatch-svc',
    phase: job.phase,
    job_id: job.id,
    rider_id: riderId,
    merchant_id: job.merchant_id,
    payload: { local: true },
  });

  const evt = dispatchPhaseToEvent(job.phase);
  if (evt) {
    await appendAqondEvent({
      order_id: job.order_id,
      event_type: evt,
      source: 'dispatch-svc',
      phase: job.phase,
      job_id: job.id,
      rider_id: riderId,
      merchant_id: job.merchant_id,
      payload: { local: true },
    });
  }
  return { job };
}

export async function localRejectDispatchJob(
  jobId: string,
  riderId: string,
  reason: string,
) {
  const store = await readJobs();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'open') return null;

  await appendAqondEvent({
    order_id: job.order_id,
    event_type: 'dispatch.rider_rejected',
    source: 'dispatch-svc',
    job_id: job.id,
    rider_id: riderId,
    merchant_id: job.merchant_id,
    payload: { reason, local: true },
  });

  return { ok: true, job };
}

const PHASE_FLOW = [
  'rider_assigned',
  'rider_picked_up',
  'en_route',
  'arrived',
  'handoff',
  'rider_completed',
];

export async function localAdvanceDispatchPhase(
  jobId: string,
  body: {
    phase?: string;
    rider_id?: string;
    photo_url?: string;
    lat?: number;
    lng?: number;
  },
) {
  const store = await readJobs();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const nextPhase =
    body.phase ||
    (() => {
      const idx = PHASE_FLOW.indexOf(job.phase);
      return PHASE_FLOW[Math.min(idx + 1, PHASE_FLOW.length - 1)] || job.phase;
    })();

  const { validateRiderPhaseAdvance } = await import('@/lib/riderDeliveryProof');
  const check = validateRiderPhaseAdvance({
    job_type: job.job_type,
    phase: job.phase,
    next_phase: nextPhase,
    proof: job,
    photo_url: body.photo_url,
  });
  if (!check.ok) {
    return { error: check.code, message: check.message } as const;
  }

  if (nextPhase === 'photo_proof' && body.photo_url) {
    job.delivery_proof_url = body.photo_url;
    job.delivery_proof_at = new Date().toISOString();
    if (body.lat != null && body.lng != null) {
      job.delivery_proof_lat = body.lat;
      job.delivery_proof_lng = body.lng;
    }
  }

  job.phase = nextPhase;
  job.updated_at = new Date().toISOString();
  if (job.phase === 'rider_picked_up' || job.phase === 'en_route') job.status = 'active';
  if (job.phase === 'rider_completed') job.status = 'completed';

  await writeJobs(store);

  const evt = dispatchPhaseToEvent(job.phase);
  if (evt) {
    await appendAqondEvent({
      order_id: job.order_id,
      event_type: evt,
      source: 'dispatch-svc',
      phase: job.phase,
      job_id: job.id,
      rider_id: body.rider_id || job.rider_id,
      merchant_id: job.merchant_id,
      payload: { local: true },
    });
  }
  if (job.phase === 'rider_completed') {
    await appendAqondEvent({
      order_id: job.order_id,
      event_type: 'order.delivered',
      source: 'dispatch-svc',
      phase: job.phase,
      job_id: job.id,
      rider_id: job.rider_id,
      merchant_id: job.merchant_id,
      payload: {
        local: true,
        delivery_proof_at: job.delivery_proof_at,
        has_photo: !!job.delivery_proof_url,
      },
    });
    if (job.rider_id) {
      const { settleRiderJobEarning } = await import('@/lib/server/riderCreditLine');
      await settleRiderJobEarning({
        rider_id: job.rider_id,
        job_id: job.id,
        order_id: job.order_id,
        job_amount_micro: job.amount_micro || 0,
      }).catch(() => null);
    }
  }

  return { job };
}
