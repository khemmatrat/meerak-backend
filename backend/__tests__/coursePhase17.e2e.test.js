/**
 * Phase 17 E2E — refund eligibility + admin revenue require auth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path.startsWith('/') ? path : `/${path}`}`, {
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
    return h.status === 200 && h.body?.ok;
  } catch {
    return false;
  }
}

test('E2E: refund eligibility requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/courses/orders/00000000-0000-0000-0000-000000000001/refund-eligibility');
  assert.equal(res.status, 401);
});

test('E2E: buyer refund POST requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/courses/orders/00000000-0000-0000-0000-000000000001/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reasonCode: 'buyer_request' }),
  });
  assert.equal(res.status, 401);
});

test('E2E: admin course revenue requires admin auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/admin/courses/revenue');
  assert.ok([401, 403].includes(res.status));
});

test('E2E: admin payout summary requires admin auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/admin/courses/payouts/summary');
  assert.ok([401, 403].includes(res.status));
});
