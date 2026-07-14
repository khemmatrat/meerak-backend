/**
 * Phase 16 E2E — recommendations endpoint + marketplace catalog badges field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.TEST_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEMO = 'aqond-marketplace-free-preview';

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

test('E2E: course detail recommendations load', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api(`/api/courses/marketplace/${DEMO}/recommendations`);
  if (res.status === 404) {
    t.skip('demo course missing');
    return;
  }
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body?.sameCategory) || res.body?.sameCategory == null);
});

test('E2E: marketplace course includes trust/badges fields', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE}`);
    return;
  }
  const res = await api(`/api/courses/marketplace/${DEMO}`);
  if (res.status === 404) {
    t.skip('demo course missing');
    return;
  }
  assert.equal(res.status, 200);
  const course = res.body?.course || res.body;
  assert.ok('trust' in course || course?.trust?.guaranteeDays != null || course?.badges != null);
});
