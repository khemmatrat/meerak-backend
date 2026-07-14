/**
 * Phase 18 E2E — admin launch endpoints require admin auth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function api(path) {
  const res = await fetch(`${BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    headers: { Accept: 'application/json' },
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

test('E2E: admin review queue requires admin auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/admin/courses/marketplace/review-queue?status=in_review');
  assert.ok([401, 403].includes(res.status));
});

test('E2E: admin launch checklist requires admin auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/admin/courses/launch-checklist');
  assert.ok([401, 403].includes(res.status));
});

test('E2E: admin funnel analytics requires admin auth', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api('/api/admin/courses/analytics/funnel');
  assert.ok([401, 403].includes(res.status));
});

test('E2E: public funnel event endpoint accepts impressions', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await fetch(`${BASE}/api/courses/analytics/events`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: 'aqond-marketplace-free-preview',
      eventType: 'course_impression',
    }),
  });
  assert.ok([200, 201, 204].includes(res.status));
});
