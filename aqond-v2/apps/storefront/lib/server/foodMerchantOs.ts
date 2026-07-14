import fs from 'fs/promises';
import path from 'path';
import { listNearbyRestaurants } from '@/lib/server/localFood';
import type { StoredOrder } from '@/lib/server/orderStore';

const ORDERS_FILE = path.join(process.cwd(), '.data', 'orders.json');
const FULFILLMENT_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-fulfillment.json');
const SHOPS_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-shops.json');
const WALLET_DIR = path.join(process.cwd(), '.data', 'dev', 'merchant-wallets');

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function readAllOrders(): Promise<StoredOrder[]> {
  try {
    const data = JSON.parse(await fs.readFile(ORDERS_FILE, 'utf8'));
    return (data.orders || []) as StoredOrder[];
  } catch {
    return [];
  }
}

async function readFulfillment(): Promise<Record<string, { fulfillment_status: string }>> {
  try {
    return JSON.parse(await fs.readFile(FULFILLMENT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function isFoodOrder(o: StoredOrder): boolean {
  return o.order_type === 'food' || (o.merchant_id || '').startsWith('food-');
}

function mapFulfillmentStatus(
  o: StoredOrder,
  fb: Record<string, { fulfillment_status: string }>,
): string {
  const fStatus = fb[o.order_id]?.fulfillment_status || o.fulfillment_status || 'pending_accept';
  if (o.status === 'cancelled') return 'cancelled';
  if (fStatus === 'delivered' || o.status === 'completed') return 'delivered';
  if (fStatus === 'shipped' || fStatus === 'picked_up') return 'delivering';
  if (fStatus === 'ready') return 'ready';
  if (fStatus === 'preparing') return 'cooking';
  if (fStatus === 'pending_accept') return 'waiting_rider';
  return fStatus;
}

export async function foodMerchantOsDashboard() {
  const start = todayStart();
  const orders = (await readAllOrders()).filter(isFoodOrder);
  const fb = await readFulfillment();
  const todayOrders = orders.filter((o) => new Date(o.created_at) >= start);

  const byStatus = (s: string) =>
    todayOrders.filter((o) => mapFulfillmentStatus(o, fb) === s).length;

  const completed = todayOrders.filter((o) =>
    ['delivered', 'completed'].includes(mapFulfillmentStatus(o, fb)) || o.status === 'completed',
  );
  const gmvMicro = completed.reduce((n, o) => n + (o.amount_micro || 0), 0);
  const platformFeeMicro = Math.round(gmvMicro * 0.12);
  const riderIncomeMicro = Math.round(gmvMicro * 0.18);
  const merchantIncomeMicro = gmvMicro - platformFeeMicro - riderIncomeMicro;

  const restaurants = await listNearbyRestaurants();
  const openMerchants = restaurants.filter((r) => r.open).length;
  const closedMerchants = restaurants.length - openMerchants;

  let pendingShops = 0;
  let suspendedShops = 0;
  try {
    const store = JSON.parse(await fs.readFile(SHOPS_FILE, 'utf8'));
    for (const profile of Object.values(store) as any[]) {
      for (const shop of profile.shops || []) {
        if (shop.status === 'pending') pendingShops += 1;
        if (shop.status === 'suspended') suspendedShops += 1;
      }
    }
  } catch {
    /* optional */
  }

  let walletBalanceMicro = 0;
  let pendingWithdrawMicro = 0;
  try {
    const files = await fs.readdir(WALLET_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const w = JSON.parse(await fs.readFile(path.join(WALLET_DIR, f), 'utf8'));
      walletBalanceMicro += w.available_micro || w.balance_micro || 0;
      pendingWithdrawMicro += w.pending_withdraw_micro || 0;
    }
  } catch {
    /* optional */
  }

  const uniqueBuyers = new Set(todayOrders.map((o) => o.buyer_id)).size;

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    today: {
      orders: todayOrders.length,
      completed: completed.length,
      cooking: byStatus('cooking'),
      waiting_rider: byStatus('waiting_rider') + byStatus('ready'),
      delivering: byStatus('delivering'),
      cancelled: byStatus('cancelled'),
      gmv_micro: gmvMicro,
      platform_fee_micro: platformFeeMicro,
      merchant_income_micro: merchantIncomeMicro,
      rider_income_micro: riderIncomeMicro,
      unique_customers: uniqueBuyers,
    },
    merchants: {
      total: restaurants.length,
      open: openMerchants,
      closed: closedMerchants,
      pending_review: pendingShops,
      suspended: suspendedShops,
    },
    riders: {
      online: 0,
      offline: 0,
      delivering: byStatus('delivering'),
      idle: 0,
      note: 'Rider counts from dispatch-svc when connected',
    },
    wallet: {
      balance_micro: walletBalanceMicro,
      pending_withdraw_micro: pendingWithdrawMicro,
    },
    platform: {
      gmv_today_micro: gmvMicro,
      orders_all_time: orders.length,
      orders_today: todayOrders.length,
    },
  };
}

export async function foodMerchantOsOrders(limit = 50) {
  const orders = (await readAllOrders()).filter(isFoodOrder);
  const fb = await readFulfillment();
  return {
    ok: true,
    orders: orders.slice(0, limit).map((o) => ({
      order_id: o.order_id,
      buyer_id: o.buyer_id,
      merchant_id: o.merchant_id,
      merchant_name: o.merchant_name,
      status: o.status,
      fulfillment_status: mapFulfillmentStatus(o, fb),
      amount_micro: o.amount_micro,
      payment_status: o.payment_status,
      method: o.method,
      item_count: o.items?.length || 0,
      created_at: o.created_at,
      delivery_eta_label: o.delivery_eta_label,
    })),
  };
}

export async function foodMerchantOsMerchants() {
  const restaurants = await listNearbyRestaurants();
  return {
    ok: true,
    merchants: restaurants.map((r) => ({
      merchant_id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      emoji: r.emoji,
      rating: r.rating,
      review_count: r.review_count,
      open: r.open,
      delivery_fee_micro: r.delivery_fee_micro,
      min_order_micro: r.min_order_micro,
      distance_km: r.distance_km,
      zone_id: r.zone_id,
    })),
  };
}

export async function foodMerchantOsRiders() {
  const { listRecentEvents } = await import('@/lib/server/aqondEventBus');
  const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');

  type JobRow = {
    id: string;
    order_id: string;
    merchant_name?: string;
    status: string;
    phase: string;
    rider_id?: string;
    job_type?: string;
    amount_micro?: number;
    pickup_lat?: number;
    pickup_lng?: number;
    dropoff_lat?: number;
    dropoff_lng?: number;
  };

  let allJobs: JobRow[] = [];
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf8');
    allJobs = (JSON.parse(raw).jobs || []) as JobRow[];
  } catch {
    /* optional */
  }

  const activeJobs = allJobs.filter((j) => j.status === 'assigned' || j.status === 'active');
  const riders = new Map<string, { rider_id: string; active_jobs: number; completed: number }>();
  for (const j of allJobs) {
    if (!j.rider_id) continue;
    const row = riders.get(j.rider_id) || { rider_id: j.rider_id, active_jobs: 0, completed: 0 };
    if (j.status === 'completed') row.completed += 1;
    else row.active_jobs += 1;
    riders.set(j.rider_id, row);
  }

  const events = await listRecentEvents(80);
  const riderEvents = events.filter(
    (e) =>
      e.event_type.startsWith('rider.') ||
      e.event_type.startsWith('dispatch.') ||
      e.event_type === 'order.delivered',
  );

  const { listOnlineRiders } = await import('@/lib/server/riderPresence');
  const onlineRiders = await listOnlineRiders();

  return {
    ok: true,
    summary: {
      open_jobs: allJobs.filter((j) => j.status === 'open').length,
      active_deliveries: activeJobs.length,
      riders_online: onlineRiders.length || riders.size,
    },
    jobs: allJobs.slice(0, 40),
    riders: [...riders.values()],
    recent_events: riderEvents.slice(0, 30),
    online_presence: onlineRiders,
  };
}

export async function foodMerchantOsDispatchPipeline() {
  const JOBS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');
  let jobs: Array<{
    id: string;
    order_id: string;
    merchant_name?: string;
    status: string;
    phase: string;
    rider_id?: string;
  }> = [];
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf8');
    jobs = JSON.parse(raw).jobs || [];
  } catch {
    /* optional */
  }

  const stage = (j: (typeof jobs)[0]) => {
    if (j.status === 'completed') return 'completed';
    if (j.status === 'active' || j.phase === 'en_route' || j.phase === 'rider_picked_up') return 'delivering';
    if (j.status === 'assigned' || j.phase === 'rider_assigned') return 'picked';
    if (j.rider_id) return 'assigned';
    if (j.status === 'open' || j.phase === 'finding_rider' || j.phase === 'food_ready') return 'waiting_rider';
    return 'waiting_rider';
  };

  const pipeline = {
    waiting_rider: jobs.filter((j) => stage(j) === 'waiting_rider'),
    assigned: jobs.filter((j) => stage(j) === 'assigned'),
    picked: jobs.filter((j) => stage(j) === 'picked'),
    delivering: jobs.filter((j) => stage(j) === 'delivering'),
    completed: jobs.filter((j) => stage(j) === 'completed').slice(0, 20),
  };

  return { ok: true, pipeline, total: jobs.length };
}
