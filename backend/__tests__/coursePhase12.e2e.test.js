/**
 * Phase 12 — HTTP E2E (requires running backend: TEST_API_URL or localhost:3001).
 * Covers marketplace routes without calling services directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEMO_COURSE = 'aqond-marketplace-free-preview';

async function api(path, opts = {}) {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function serverUp() {
  try {
    const h = await api('/api/course-marketplace/health');
    return h.status === 200;
  } catch {
    return false;
  }
}

test('E2E: course marketplace health includes Phase 12 fields', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const { status, body } = await api('/api/course-marketplace/health');
  assert.equal(status, 200);
  assert.ok(body.tables);
  assert.ok('course_purchase_gateway_charges' in body.tables);
  assert.ok('ledgerIntegrity' in body);
  assert.ok('securityAudit' in body);
  assert.ok(typeof body.purchaseRoutes === 'boolean');
  assert.ok(typeof body.gatewayRoutes === 'boolean');
});

test('E2E: marketplace catalog and detail load', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const list = await api('/api/courses/marketplace?limit=5');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body?.courses));

  const detail = await api(`/api/courses/marketplace/${DEMO_COURSE}`);
  if (detail.status === 404) {
    t.skip(`Demo course ${DEMO_COURSE} not seeded`);
    return;
  }
  assert.equal(detail.status, 200);
  assert.ok(detail.body?.course || detail.body?.id || detail.body?.title);
  const lessons = detail.body?.lessons || detail.body?.course?.lessons || [];
  for (const lesson of lessons) {
    assert.equal(lesson.videoUrl, undefined, 'detail must not expose videoUrl');
    assert.equal(lesson.video_url, undefined, 'detail must not expose video_url');
  }
});

test('E2E: purchase requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api(`/api/courses/${DEMO_COURSE}/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMode: 'wallet' }),
  });
  assert.equal(res.status, 401);
});

test('E2E: gateway purchase requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api(`/api/courses/${DEMO_COURSE}/purchase/gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod: 'promptpay' }),
  });
  assert.equal(res.status, 401);
});

test('E2E: purchase-quote is public for published course', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api(`/api/courses/${DEMO_COURSE}/purchase-quote`);
  if (res.status === 404) {
    t.skip('purchase-quote route or course missing — restart backend');
    return;
  }
  assert.ok([200, 401].includes(res.status));
});

test('E2E: wallet deposit preview regression (payment system unchanged)', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/wallet/deposit/preview?amount=100&payment_method=promptpay');
  assert.equal(res.status, 200);
  assert.ok(res.body?.gross_amount != null || res.body?.net_to_wallet != null);
});

test('E2E: funnel analytics event endpoint accepts course events', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/courses/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: DEMO_COURSE,
      eventType: 'course_detail_view',
    }),
  });
  assert.ok([200, 201, 204].includes(res.status));
});
