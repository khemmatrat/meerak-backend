/**
 * Phase 19 — Payment regression: job/booking/wallet flows unchanged after course marketplace.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..');

export const PAYMENT_REGRESSION_CHECKS = [
  { id: 'wallet_deposit_preview', label: 'Wallet deposit preview (public calc)' },
  { id: 'jobs_recommended', label: 'Job board recommended route' },
  { id: 'bookings_route', label: 'Booking routes registered' },
  { id: 'booking_pay_deposit_route', label: 'Booking pay-deposit handler exists' },
  { id: 'wallet_deposit_auth', label: 'Wallet deposit create requires auth' },
  { id: 'course_purchase_isolated', label: 'Course purchase auth-gated (not 404)' },
  { id: 'no_financial_engine_in_course', label: 'Course module does not import financialEngine' },
  { id: 'legacy_payment_handlers', label: 'Legacy payment handlers still in server.js' },
  { id: 'marketplace_health', label: 'Course marketplace health OK' },
];

async function hit(baseUrl, path, { method = 'GET', body = null, expectStatuses = [200] } = {}) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ok = expectStatuses.includes(res.status);
    return { ok, status: res.status, expected: expectStatuses };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}

function fileHasAll(relPath, patterns) {
  const full = join(BACKEND_ROOT, relPath);
  if (!existsSync(full)) return { ok: false, error: 'file_missing', path: relPath };
  const text = readFileSync(full, 'utf8');
  const missing = patterns.filter((p) => !text.includes(p));
  return { ok: missing.length === 0, missing, path: relPath };
}

function courseModuleAvoidsFinancialEngine() {
  const files = [
    'lib/coursePurchaseService.js',
    'routes/coursePurchase.js',
    'lib/coursePurchaseGateway.js',
    'lib/courseRefundService.js',
  ];
  const violations = [];
  for (const rel of files) {
    const full = join(BACKEND_ROOT, rel);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    if (/financialEngine|paymentBusinessActions\/processPayment/.test(text)) {
      violations.push(rel);
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * @param {string} [baseUrl]
 */
export async function runCoursePaymentRegression(baseUrl) {
  const base = (baseUrl || process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const results = [];

  let serverUp = false;
  try {
    const h = await fetch(`${base}/api/course-marketplace/health`);
    serverUp = h.ok;
  } catch {
    serverUp = false;
  }

  if (serverUp) {
    const checks = [
      ['wallet_deposit_preview', '/api/wallet/deposit/preview?amount=100&payment_method=promptpay', [200]],
      ['jobs_recommended', '/api/jobs/recommended', [200, 401, 503]],
      ['bookings_me', '/api/bookings/me', [401, 403]],
      ['bookings_create', '/api/bookings', [400, 401, 403, 422], 'POST', {}],
      ['wallet_deposit_auth', '/api/wallet/deposit', [401, 403], 'POST', { amount: 100 }],
      ['course_purchase_auth', '/api/courses/aqond-marketplace-free-preview/purchase', [401], 'POST', { paymentMode: 'wallet' }],
      ['course_gateway_auth', '/api/courses/aqond-service-business-starter/purchase/gateway', [401], 'POST', { paymentMethod: 'promptpay' }],
      ['marketplace_health', '/api/course-marketplace/health', [200]],
    ];

    for (const row of checks) {
      const [id, path, expectStatuses, method = 'GET', body = null] = row;
      const meta = PAYMENT_REGRESSION_CHECKS.find((c) => c.id === id) || { id, label: id };
      const detail = await hit(base, path, { method, body, expectStatuses });
      results.push({ id, label: meta.label, pass: detail.ok, detail: { ...detail, baseUrl: base } });
    }

    const bookingsMe = results.find((r) => r.id === 'bookings_me');
    if (bookingsMe) {
      results.push({
        id: 'bookings_route',
        label: 'Booking routes registered',
        pass: bookingsMe.pass,
        detail: { via: 'bookings_me', ...bookingsMe.detail },
      });
    }
  } else {
    for (const meta of PAYMENT_REGRESSION_CHECKS.filter((c) =>
      ['wallet_deposit_preview', 'jobs_recommended', 'bookings_route', 'marketplace_health'].includes(c.id),
    )) {
      results.push({
        id: meta.id,
        label: meta.label,
        pass: false,
        detail: { skipped: true, reason: `backend not reachable at ${base}` },
      });
    }
  }

  const payDeposit = fileHasAll('server.js', ["app.post('/api/bookings/:id/pay-deposit'"]);
  results.push({
    id: 'booking_pay_deposit_route',
    label: 'Booking pay-deposit handler exists',
    pass: payDeposit.ok,
    detail: payDeposit,
  });

  const legacy = fileHasAll('server.js', [
    "app.post('/api/wallet/deposit'",
    "app.get('/api/wallet/deposit/preview'",
  ]);
  results.push({
    id: 'legacy_payment_handlers',
    label: 'Legacy payment handlers still in server.js',
    pass: legacy.ok,
    detail: legacy,
  });

  const isolated = courseModuleAvoidsFinancialEngine();
  results.push({
    id: 'no_financial_engine_in_course',
    label: 'Course module does not import financialEngine',
    pass: isolated.ok,
    detail: isolated,
  });

  if (!serverUp) {
    const bookings = fileHasAll('server.js', ["app.post('/api/bookings'", "app.get('/api/bookings/me'"]);
    results.push({
      id: 'bookings_route',
      label: 'Booking routes registered',
      pass: bookings.ok,
      detail: { ...bookings, mode: 'static_fallback' },
    });
  }

  const passCount = results.filter((r) => r.pass).length;
  return {
    pass: results.every((r) => r.pass),
    passCount,
    total: results.length,
    serverUp,
    baseUrl: base,
    checks: results,
    generatedAt: new Date().toISOString(),
  };
}
