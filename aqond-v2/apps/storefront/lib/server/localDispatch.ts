import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { listNearbyRestaurants } from '@/lib/server/localFood';
import { appendAqondEvent, dispatchPhaseToEvent } from '@/lib/server/aqondEventBus';
import type { DispatchJob } from '@/lib/server/dispatchSvc';
import { vehicleAllowsJobType } from '@/lib/riderVehicleTypes';
import { filterJobsByRadius } from '@/lib/server/geoFilter';

const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');

export type LocalDispatchJob = DispatchJob & {
  buyer_id?: string;
  job_type?: 'food' | 'parcel' | 'passenger';
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  rider_id?: string;
  delivery_proof_url?: string;
  delivery_proof_at?: string;
  delivery_proof_lat?: number;
  delivery_proof_lng?: number;
  pickup_photo_url?: string;
  pickup_verified_at?: string;
  updated_at?: string;
  // Passenger-only (ADR_PASSENGER_INTEGRATION.md) — empty for food/parcel.
  passenger_user_id?: string;
  transport_contract?: Record<string, unknown>;
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
  job_type?: 'food' | 'parcel' | 'passenger';
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  handoff_note?: string;
  eta_label?: string;
  recipient_name?: string;
  customer_phone?: string;
  passenger_user_id?: string;
  transport_contract?: Record<string, unknown>;
}): Promise<{ job: LocalDispatchJob; created: boolean }> {
  const store = await readJobs();
  const existing = store.jobs.find((j) => j.order_id === input.order_id && j.status !== 'cancelled');
  if (existing) return { job: existing, created: false };

  const hasPickup = input.pickup_lat != null && input.pickup_lng != null && input.pickup_lat !== 0;
  const hasDropoff = input.dropoff_lat != null && input.dropoff_lng != null && input.dropoff_lat !== 0;

  // Passenger rides always carry real pickup/dropoff coords from the rider
  // (no merchant to derive coords from) — see ADR_PASSENGER_INTEGRATION.md.
  if (input.job_type === 'passenger' && (!hasPickup || !hasDropoff)) {
    throw new Error('pickup_and_dropoff_location_required');
  }

  const pickup: { lat: number; lng: number } = hasPickup
    ? { lat: input.pickup_lat as number, lng: input.pickup_lng as number }
    : await coordsForMerchant(input.merchant_id);

  let dropoff: { lat: number; lng: number };
  if (hasDropoff) {
    dropoff = { lat: input.dropoff_lat as number, lng: input.dropoff_lng as number };
  } else {
    if (input.job_type === 'parcel') {
      throw new Error('parcel_dropoff_location_required');
    }
    dropoff = dropoffNearPickup(pickup);
  }

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
    payment_method: input.payment_method || (input.job_type === 'passenger' ? 'cash' : 'cod'),
    job_type: input.job_type || 'food',
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    passenger_user_id: input.passenger_user_id,
    transport_contract: input.transport_contract,
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

export async function localGetDispatchJob(jobId: string): Promise<LocalDispatchJob | null> {
  const store = await readJobs();
  return store.jobs.find((j) => j.id === jobId) || null;
}

export async function localUpdateJobLocation(jobId: string, lat: number, lng: number) {
  const store = await readJobs();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  (job as LocalDispatchJob & { rider_lat?: number; rider_lng?: number }).rider_lat = lat;
  (job as LocalDispatchJob & { rider_lat?: number; rider_lng?: number }).rider_lng = lng;
  job.updated_at = new Date().toISOString();
  await writeJobs(store);
  return job;
}

export async function localListDispatchJobs(opts: {
  rider_id?: string;
  status?: string;
  vehicle?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
}) {
  const store = await readJobs();
  let jobs = store.jobs;
  if (opts.status === 'open') {
    jobs = jobs.filter((j) => j.status === 'open');
  } else if (opts.rider_id) {
    jobs = jobs.filter((j) => j.rider_id === opts.rider_id && j.status !== 'completed');
  }
  if (opts.vehicle) {
    jobs = jobs.filter((j) => vehicleAllowsJobType(opts.vehicle!, j.job_type));
  }
  if (opts.lat != null && opts.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    jobs = filterJobsByRadius(jobs, opts.lat, opts.lng, opts.radius_km);
  }
  return { jobs, source: 'local-dispatch' };
}

export async function localAcceptDispatchJob(jobId: string, riderId: string, riderVehicle?: string) {
  const store = await readJobs();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'open') return null;

  if (riderVehicle && !vehicleAllowsJobType(riderVehicle, job.job_type)) {
    return {
      error: 'vehicle_job_type_mismatch',
      message: 'ยานพาหนะของคุณไม่รองรับงานประเภทนี้',
      vehicle: riderVehicle,
      job_type: job.job_type,
    } as const;
  }

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

import {
  phaseFlowForJobType,
  isValidPhaseAdvance,
} from '@/lib/riderPhaseFlow';

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

  const flow = phaseFlowForJobType(job.job_type);
  const requested = body.phase;
  const nextPhase =
    requested && isValidPhaseAdvance(job.phase, requested, job.job_type, {
      paymentMethod: job.payment_method,
    })
      ? requested
      : (() => {
          const idx = flow.indexOf(job.phase);
          return flow[Math.min(idx + 1, flow.length - 1)] || job.phase;
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

  if (
    nextPhase === 'rider_picked_up' &&
    (job.job_type || 'food') === 'food'
  ) {
    const { assertCanDepartMerchant } = await import('@/lib/server/pickupVerification');
    const depart = await assertCanDepartMerchant(job.order_id, job.job_type);
    if (!depart.ok) {
      return { error: depart.code, message: depart.message } as const;
    }
  }

  if (nextPhase === 'pickup_photo' && body.photo_url) {
    job.pickup_photo_url = body.photo_url;
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
  if (
    job.phase === 'rider_picked_up' ||
    job.phase === 'en_route' ||
    job.phase === 'en_route_pickup' ||
    job.phase === 'passenger_aboard'
  ) {
    job.status = 'active';
  }
  if (job.phase === 'rider_completed' || job.phase === 'trip_completed') job.status = 'completed';

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
  if (job.phase === 'rider_completed' || job.phase === 'trip_completed') {
    await appendAqondEvent({
      order_id: job.order_id,
      event_type: job.job_type === 'passenger' ? 'passenger.trip_completed' : 'order.delivered',
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

/** When rider GPS updates while online, log offer events for nearby open jobs (local auto-match). */
export async function localOnRiderTelemetry(
  riderId: string,
  lat: number,
  lng: number,
  online: boolean,
) {
  if (!online) return;
  const store = await readJobs();
  const openJobs = store.jobs.filter(
    (j) => j.status === 'open' && (j.phase === 'finding_rider' || j.phase === 'food_ready'),
  );
  for (const job of openJobs) {
    if (job.pickup_lat == null || job.pickup_lng == null) continue;
    const { haversineKm, DEFAULT_JOB_RADIUS_KM } = await import('@/lib/server/geoFilter');
    const dist = haversineKm({ lat, lng }, { lat: job.pickup_lat, lng: job.pickup_lng });
    if (dist > DEFAULT_JOB_RADIUS_KM) continue;
    await appendAqondEvent({
      order_id: job.order_id,
      event_type: 'dispatch.rider_offered',
      source: 'dispatch-svc',
      job_id: job.id,
      rider_id: riderId,
      merchant_id: job.merchant_id,
      payload: { local: true, distance_km: Math.round(dist * 10) / 10, trigger: 'rider_telemetry' },
    });
    break;
  }
}
