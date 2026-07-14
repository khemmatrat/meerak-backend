import { BUSINESS_IMPACT_LABEL, getScenarioBusinessMeta } from '@/lib/experience/scenarioCatalog';

export type ScenarioTelemetryPayload = {
  scenario_id: string;
  mission_id?: string;
  surface: string;
  load_ms?: number;
  render_ms?: number;
  retry?: boolean;
  error?: string | null;
  cache_hit?: boolean;
  network_profile?: string;
  product_count?: number;
  business_impact?: string;
  time_saved_minutes?: number;
  experience_dims?: Partial<ExperienceDimensions>;
  meta?: Record<string, unknown>;
};

export type ExperienceDimensions = {
  speed: number;
  clarity: number;
  recovery: number;
  smoothness: number;
  confidence: number;
};

const QUEUE: ScenarioTelemetryPayload[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function experienceScore(dims: ExperienceDimensions): number {
  const values = [dims.speed, dims.clarity, dims.recovery, dims.smoothness, dims.confidence];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

export function enqueueScenarioTelemetry(payload: ScenarioTelemetryPayload) {
  if (typeof window === 'undefined') return;
  QUEUE.push(payload);
  void flushScenarioTelemetry();
  if (!flushTimer) {
    flushTimer = setInterval(() => void flushScenarioTelemetry(), 15_000);
    window.addEventListener('pagehide', () => void flushScenarioTelemetry());
  }
}

export async function flushScenarioTelemetry() {
  if (typeof window === 'undefined' || QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, QUEUE.length);
  try {
    await fetch('/api/experience/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    QUEUE.unshift(...batch);
  }
}

export function recordHomeTelemetry(input: {
  loadMs?: number;
  renderMs?: number;
  retry?: boolean;
  error?: string | null;
  cacheHit?: boolean;
  productCount?: number;
  networkProfile?: string;
}) {
  recordScenarioTelemetry('S001', 'home', input);
}

export function recordSearchTelemetry(input: {
  loadMs?: number;
  renderMs?: number;
  retry?: boolean;
  error?: string | null;
  resultCount?: number;
  query?: string;
  source?: string;
  networkProfile?: string;
}) {
  recordScenarioTelemetry('S002', 'search', {
    loadMs: input.loadMs,
    renderMs: input.renderMs,
    retry: input.retry,
    error: input.error,
    productCount: input.resultCount,
    networkProfile: input.networkProfile,
    query: input.query,
    source: input.source,
  });
}

export function recordProductTelemetry(input: {
  loadMs?: number;
  productId?: string;
  error?: string | null;
  hasDetail?: boolean;
}) {
  recordScenarioTelemetry('S003', 'product', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.hasDetail ? 1 : 0,
    query: input.productId,
    source: input.hasDetail ? 'product-detail' : 'missing',
  });
}

export function recordPaymentResultTelemetry(input: {
  loadMs?: number;
  resultStatus?: string;
  amount?: string;
  ref?: string;
  error?: string | null;
  traceId?: string;
}) {
  recordScenarioTelemetry('S010', 'payment_result', {
    loadMs: input.loadMs,
    error: input.error,
    query: input.ref,
    source: input.resultStatus || 'result',
    networkProfile: input.amount,
    traceId: input.traceId,
  });
}

export function recordPaymentVerifyTelemetry(input: {
  loadMs?: number;
  orderIds?: string[];
  ref?: string;
  verifyStatus?: string;
  duplicate?: boolean;
  error?: string | null;
  traceId?: string;
}) {
  recordScenarioTelemetry('S009', 'payment_verify', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.orderIds?.length,
    query: input.ref,
    source: input.duplicate
      ? 'duplicate'
      : input.verifyStatus || 'verify',
    traceId: input.traceId,
  });
}

export function recordPaymentUiTelemetry(input: {
  loadMs?: number;
  orderIds?: string[];
  amount?: string;
  ref?: string;
  paymentMethod?: string;
  expired?: boolean;
  error?: string | null;
  traceId?: string;
}) {
  recordScenarioTelemetry('S008', 'payment_ui', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.orderIds?.length,
    query: input.ref,
    source: input.expired
      ? 'expired'
      : input.paymentMethod || input.amount || 'payment_ui',
    traceId: input.traceId,
  });
}

export function recordPlaceOrderTelemetry(input: {
  loadMs?: number;
  orderId?: string;
  cartCount?: number;
  totalMicro?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  duplicate?: boolean;
  error?: string | null;
  traceId?: string;
}) {
  recordScenarioTelemetry('S007', 'place_order', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.cartCount,
    query: input.orderId,
    source: input.duplicate ? 'duplicate' : input.paymentStatus || input.paymentMethod || 'place',
    traceId: input.traceId,
  });
}

export function recordCheckoutStartTelemetry(input: {
  loadMs?: number;
  cartCount?: number;
  totalMicro?: number;
  hasAddress?: boolean;
  shippingReady?: boolean;
  walletVisible?: boolean;
  promoVisible?: boolean;
  paymentVisible?: boolean;
  error?: string | null;
  traceId?: string;
}) {
  const flags = [
    input.hasAddress ? 'addr' : '',
    input.shippingReady ? 'ship' : '',
    input.walletVisible ? 'wallet' : '',
    input.promoVisible ? 'promo' : '',
    input.paymentVisible ? 'pay' : '',
  ]
    .filter(Boolean)
    .join('+');
  recordScenarioTelemetry('S006', 'checkout_start', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.cartCount,
    source: flags || 'entry',
    query: input.totalMicro != null ? String(input.totalMicro) : undefined,
    traceId: input.traceId,
  });
}

export function recordCartViewTelemetry(input: {
  loadMs?: number;
  cartCount?: number;
  lineCount?: number;
  totalMicro?: number;
  empty?: boolean;
  error?: string | null;
  cacheHit?: boolean;
  source?: string;
  traceId?: string;
}) {
  recordScenarioTelemetry('S005', 'cart_view', {
    loadMs: input.loadMs,
    error: input.error,
    cacheHit: input.cacheHit,
    productCount: input.cartCount,
    networkProfile: input.empty ? 'empty' : undefined,
    query: input.totalMicro != null ? String(input.totalMicro) : undefined,
    source: input.source || (input.empty ? 'empty' : `lines:${input.lineCount ?? 0}`),
    traceId: input.traceId,
  });
}

export function recordCartAddTelemetry(input: {
  loadMs?: number;
  productId?: string;
  cartCount?: number;
  qty?: number;
  error?: string | null;
  traceId?: string;
}) {
  recordCartTelemetry('cart_add', {
    loadMs: input.loadMs,
    error: input.error,
    productCount: input.cartCount,
    query: input.productId,
    source: input.error ? 'failed' : `qty:${input.qty ?? 1}`,
    traceId: input.traceId,
  });
}

export function recordCartMergeTelemetry(input: {
  loadMs?: number;
  cartCount?: number;
  mergedLines?: number;
  traceId?: string;
}) {
  recordCartTelemetry('cart_merge', {
    loadMs: input.loadMs,
    productCount: input.cartCount,
    source: `merged:${input.mergedLines ?? 0}`,
    traceId: input.traceId,
  });
}

export function recordCartRemoveTelemetry(input: {
  productId?: string;
  cartCount?: number;
  traceId?: string;
}) {
  recordCartTelemetry('cart_remove', {
    productCount: input.cartCount,
    query: input.productId,
    source: 'qty_zero',
    traceId: input.traceId,
  });
}

export function recordCartRefreshTelemetry(input: {
  loadMs?: number;
  cartCount?: number;
  cacheHit?: boolean;
  source?: string;
  traceId?: string;
}) {
  recordCartTelemetry('cart_refresh', {
    loadMs: input.loadMs,
    productCount: input.cartCount,
    cacheHit: input.cacheHit,
    source: input.source,
    traceId: input.traceId,
  });
}

export function recordCartRestoreTelemetry(input: {
  loadMs?: number;
  cartCount?: number;
  source?: string;
  traceId?: string;
}) {
  recordCartTelemetry('cart_restore', {
    loadMs: input.loadMs,
    productCount: input.cartCount,
    cacheHit: true,
    source: input.source,
    traceId: input.traceId,
  });
}

export function recordCartRecoveryTelemetry(input: {
  source?: string;
  traceId?: string;
}) {
  recordCartTelemetry('cart_recovery', {
    retry: true,
    source: input.source || 'online',
    traceId: input.traceId,
  });
}

function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tr-${Date.now()}`;
}

function recordCartTelemetry(
  surface:
    | 'cart_add'
    | 'cart_merge'
    | 'cart_remove'
    | 'cart_refresh'
    | 'cart_restore'
    | 'cart_recovery',
  input: {
    loadMs?: number;
    renderMs?: number;
    retry?: boolean;
    error?: string | null;
    cacheHit?: boolean;
    productCount?: number;
    networkProfile?: string;
    query?: string;
    source?: string;
    traceId?: string;
  },
) {
  recordScenarioTelemetry('S004', surface, {
    ...input,
    traceId: input.traceId || newTraceId(),
  });
}

export function recordDeliveryProvinceConfigTelemetry(input: {
  source?: string;
  enabled_count?: number;
  max_pickup_radius_km?: number;
  loadMs?: number;
  traceId?: string;
}) {
  recordScenarioTelemetry('B2.5-S002', 'delivery_province_config', {
    loadMs: input.loadMs,
    source: input.source,
    productCount: input.enabled_count,
    traceId: input.traceId,
  });
}

export function recordDeliveryConfigTelemetry(input: {
  source?: string;
  province_count?: number;
  express_province_count?: number;
  max_pickup_radius_km?: number;
  loadMs?: number;
  traceId?: string;
}) {
  recordScenarioTelemetry('B2.5-S001', 'delivery_core_config', {
    loadMs: input.loadMs,
    source: input.source,
    productCount: input.province_count,
    traceId: input.traceId,
  });
}

export function recordScenarioTelemetry(
  scenarioId: string,
  surface: string,
  input: {
    loadMs?: number;
    renderMs?: number;
    retry?: boolean;
    error?: string | null;
    cacheHit?: boolean;
    productCount?: number;
    networkProfile?: string;
    query?: string;
    source?: string;
    traceId?: string;
  },
) {
  const dims: ExperienceDimensions = {
    speed: scoreSpeed(input.loadMs),
    clarity: input.error ? 6 : input.productCount === 0 && input.query ? 7 : 10,
    recovery: input.retry || input.cacheHit ? 9.5 : 10,
    smoothness: scoreSmoothness(input.productCount),
    confidence: input.error ? 5 : 9.5,
  };

  const catalog = getScenarioBusinessMeta(scenarioId);
  const traceId = input.traceId || newTraceId();

  enqueueScenarioTelemetry({
    scenario_id: scenarioId,
    mission_id: catalog?.mission_id || 'M-001',
    surface,
    load_ms: input.loadMs,
    render_ms: input.renderMs,
    retry: input.retry,
    error: input.error ?? null,
    cache_hit: input.cacheHit,
    network_profile: input.networkProfile,
    product_count: input.productCount,
    business_impact: catalog?.business_impact,
    time_saved_minutes: catalog?.time_saved_minutes,
    experience_dims: dims,
    meta: {
      experience_score: experienceScore(dims),
      business_impact_label: catalog ? BUSINESS_IMPACT_LABEL[catalog.business_impact] : undefined,
      query: input.query,
      source: input.source,
      trace_id: traceId,
    },
  });

  void maybeEmitJarvisObservation(scenarioId, surface, dims, input);
}

function scoreSpeed(loadMs?: number): number {
  if (loadMs == null) return 9;
  if (loadMs < 150) return 10;
  if (loadMs < 500) return 9.5;
  if (loadMs < 1500) return 9;
  if (loadMs < 3000) return 8.5;
  if (loadMs < 5000) return 7;
  return 5;
}

function scoreSmoothness(count?: number): number {
  if (count == null) return 8;
  if (count <= 100) return 10;
  if (count <= 1000) return 8.5;
  if (count <= 5000) return 7.5;
  return 6;
}

async function maybeEmitJarvisObservation(
  scenarioId: string,
  surface: string,
  dims: ExperienceDimensions,
  input: { loadMs?: number; retry?: boolean; error?: string | null; query?: string; productCount?: number },
) {
  const score = experienceScore(dims);
  const insights: Array<{ key: string; message: string; severity: 'info' | 'warn' | 'alert' }> = [];

  if (input.loadMs != null && input.loadMs > 3000) {
    insights.push({
      key: `${surface}_load_slow`,
      message: `${surface} โหลด ${(input.loadMs / 1000).toFixed(1)}s — สูงกว่าเป้า 3s`,
      severity: 'warn',
    });
  }
  if (input.retry) {
    insights.push({
      key: `${surface}_retry`,
      message: `ผู้ใช้กด Retry ใน ${surface}`,
      severity: 'info',
    });
  }
  if (input.error) {
    insights.push({
      key: `${surface}_error`,
      message: `${surface} error: ${input.error}`,
      severity: 'alert',
    });
  }
  if (surface === 'search' && input.query && input.productCount === 0) {
    insights.push({
      key: 'search_zero_results',
      message: `ค้นหา "${input.query}" ไม่พบผลลัพธ์ — พิจารณา synonym / fuzzy`,
      severity: 'info',
    });
  }
  if (score < 8) {
    insights.push({
      key: `${surface}_experience_score`,
      message: `${surface} Experience Score ${score}/10 — ต่ำกว่าเกณฑ์ Production (8.0)`,
      severity: 'warn',
    });
  }

  if (insights.length === 0) return;

  try {
    await fetch('/api/experience/observation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface,
        scenario_id: scenarioId,
        experience_score: score,
        dimensions: dims,
        insights,
      }),
    });
  } catch {
    /* silent */
  }
}
