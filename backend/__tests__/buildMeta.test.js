import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildMeta } from '../lib/buildMeta.js';

test('getBuildMeta exposes service identity and auth route manifest', () => {
  const m = getBuildMeta();
  assert.equal(m.service, 'MEERAK Backend');
  assert.equal(typeof m.version, 'string');
  assert.equal(m.fixVersion, '2026-05-27-auth-diag');
  assert.ok(Array.isArray(m.expectedAuthRoutes));
  assert.ok(m.expectedAuthRoutes.includes('POST /api/auth/login'));
  assert.ok(m.expectedAuthRoutes.includes('GET /api/app/bootstrap'));
  assert.equal(typeof m.runtime.uptimeSec, 'number');
});
