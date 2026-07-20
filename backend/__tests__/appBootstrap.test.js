import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { bootstrapEnvelope, registerAppBootstrapRoute } from '../lib/appBootstrap.js';

test('bootstrapEnvelope includes mobile extension fields with null-safe defaults', () => {
  const cfg = { iosMinVersion: '1', androidMinVersion: '1', remote: {}, featureFlags: {} };
  const body = bootstrapEnvelope(cfg, '2026-01-01T00:00:00.000Z', '2026-07-20T00:00:00.000Z');
  assert.equal(body.config, cfg);
  assert.equal(body.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(body.paymentProvider, null);
  assert.equal(body.transportPricing, null);
  assert.deepEqual(body.promoFund, { balance_thb: 0, visible: false, updated_at: null });
  assert.deepEqual(body.complianceVersions, { terms: null, privacy: null });
  assert.deepEqual(body.communityChallenge, { enabled: false });
  assert.equal(body.fetchedAt, '2026-07-20T00:00:00.000Z');
});

test('registerAppBootstrapRoute serves GET /api/app/bootstrap', async () => {
  const app = express();
  registerAppBootstrapRoute(app, {
    pool: {
      query: async () => ({ rows: [] }),
    },
    normalizeStoredMobileAppConfig: (parsed) => ({ ...parsed, normalized: true }),
    augmentMobileConfigForPublicClients: async (config) => ({ ...config, augmented: true }),
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/app/bootstrap`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.config.normalized, true);
    assert.equal(json.config.augmented, true);
    assert.equal(json.updatedAt, null);
    assert.ok(json.fetchedAt);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
