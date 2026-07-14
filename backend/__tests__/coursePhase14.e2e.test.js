/**
 * Phase 14 — HTTP E2E: receipt + instructor sales require auth.
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

test('E2E: course order receipt requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/courses/orders/00000000-0000-0000-0000-000000000001/receipt');
  assert.equal(res.status, 401);
});

test('E2E: instructor sales dashboard requires auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/instructor/sales');
  assert.equal(res.status, 401);
});

test('E2E: instructor dashboard alias responds like sales', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const sales = await api('/api/instructor/sales');
  const dash = await api('/api/instructor/dashboard');
  assert.equal(sales.status, 401);
  assert.equal(dash.status, 401);
});
