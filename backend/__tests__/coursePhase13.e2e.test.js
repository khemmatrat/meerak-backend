/**
 * Phase 13 — HTTP E2E readiness fields (requires running backend).
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
    return h.status === 200;
  } catch {
    return false;
  }
}

test('E2E: health includes Phase 13 readiness fields', async (t) => {
  if (!(await serverUp())) {
    t.skip(`Backend not reachable at ${BASE} — restart after migration 246`);
    return;
  }
  const { status, body } = await api('/api/course-marketplace/health');
  assert.equal(status, 200);
  assert.ok(body.demoCourseIds?.paid);
  assert.ok(body.demoCourseIds?.free);
  assert.ok(typeof body.studioRoutes === 'boolean');
  assert.ok(typeof body.marketplaceRoutes === 'boolean');
  assert.ok(typeof body.previewLessons === 'number');
  assert.ok(typeof body.hint === 'string');
  assert.ok(Array.isArray(body.devRestartChecklist));
});
