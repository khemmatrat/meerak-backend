/**
 * Phase 11 – Governance Engine (GOVERNANCE_SPEC)
 * Tests GV01–GV10 (G01–G05 coverage)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

process.env.AIVOS_RESUME_PLUGIN_ENABLED = '1';
process.env.AIVOS_RUNTIME_ENABLED       = '1';
process.env.AIVOS_MARKETPLACE_ENABLED   = '1';
process.env.AIVOS_GOVERNANCE_ENABLED    = '1';

import { createRuntime } from '../lib/aivos/runtime/index.js';
import { createGovernanceEngine } from '../lib/aivos/governance/index.js';
import { createMemoryRuntimeStore } from '../lib/aivos/runtime/index.js';
import { registerAivosRoutes, getAivosRuntime } from '../lib/aivos/index.js';
import { sha256Artifact } from '../lib/aivos/governance/versioning.js';

const __dir = dirname(fileURLToPath(import.meta.url));

function makeRuntime(overrides = {}) {
  return createRuntime({ syncExecute: true, ...overrides });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('GV01 governance disabled returns stub with enabled=false', () => {
  const saved = process.env.AIVOS_GOVERNANCE_ENABLED;
  process.env.AIVOS_GOVERNANCE_ENABLED = '0';
  const rt = makeRuntime();
  assert.equal(rt.governance.enabled, false);
  process.env.AIVOS_GOVERNANCE_ENABLED = saved;
});

test('GV02 audit append records governance audit row (G01)', async () => {
  const store = createMemoryRuntimeStore({});
  const gov = createGovernanceEngine({ store });
  await gov.auditVersionChange({
    entityType: 'runtime_plan',
    entityId:   'plan-1',
    entityVersion: 1,
    action:     'created',
    jobId:      'job-gv02',
  });
  const rows = gov.listAudit({ jobId: 'job-gv02' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity_type, 'runtime_plan');
});

test('GV03 version pin stores entity version (G02)', () => {
  const store = createMemoryRuntimeStore({});
  const gov = createGovernanceEngine({ store });
  const pin = gov.pinVersion({ entityType: 'plugin', entityId: 'resume-ai', version: '1.0.0', actorId: 'admin' });
  assert.equal(pin.entity_id, 'resume-ai');
  const fetched = gov.getPin({ entityType: 'plugin', entityId: 'resume-ai' });
  assert.equal(fetched.version, '1.0.0');
});

test('GV04 reproduce returns artifact hashes (G03)', async () => {
  const rt = makeRuntime();
  const job = await rt.store.insertJob({ plugin_id: 'resume-ai', status: 'completed' });
  await rt.store.insertPlan({ job_id: job.id, dag: { nodes: [] }, version: 1 });
  const result = await rt.governance.reproduce(job.id);
  assert.ok(result.hashes.plan);
  assert.ok(result.hashes.job);
});

test('GV05 diff detects artifact change vs baseline (G03)', async () => {
  const rt = makeRuntime();
  const job = await rt.store.insertJob({ plugin_id: 'resume-ai', status: 'completed' });
  await rt.store.insertPlan({ job_id: job.id, dag: { nodes: [{ id: 'ocr' }] }, version: 1 });
  const baseline = await rt.governance.reproduce(job.id);
  await rt.store.updateJob(job.id, { status: 'failed' });
  const diff = await rt.governance.diff(job.id, baseline);
  assert.equal(diff.match, false);
  assert.equal(diff.diff.job.match, false);
});

test('GV06 audit trail is append-only with no delete method (G05)', () => {
  const store = createMemoryRuntimeStore({});
  const gov = createGovernanceEngine({ store });
  assert.equal(typeof store.deleteGovernanceAudit, 'undefined');
  assert.equal(typeof gov.deleteAudit, 'undefined');
});

test('GV07 marketplace install writes governance audit (G04)', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', userId: 'u1' });
  const audits = rt.governance.listAudit({ entityType: 'marketplace_plugin', entityId: 'resume-ai' });
  assert.ok(audits.length >= 1);
  assert.equal(audits[0].action, 'install');
});

test('GV08 marketplace rollback writes rollback audit and pin', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', version: '1.0.0', userId: 'u1' });
  await rt.marketplace.upgrade({ packageId: 'resume-ai', type: 'plugin', version: '2.0.0' });
  await rt.marketplace.rollback({ packageId: 'resume-ai', type: 'plugin' });
  const pin = rt.governance.getPin({ entityType: 'plugin', entityId: 'resume-ai' });
  assert.equal(pin.version, '1.0.0');
  const audits = rt.governance.listAudit({ entityId: 'resume-ai' });
  assert.ok(audits.some((a) => a.action === 'rollback'));
});

test('GV09 version snapshot saved on marketplace audit', async () => {
  const rt = makeRuntime();
  await rt.marketplace.install({ packageId: 'resume-ai', type: 'plugin', userId: 'u1' });
  const snaps = rt.governance.listSnapshots({ entityType: 'plugin', entityId: 'resume-ai' });
  assert.ok(snaps.length >= 1);
  assert.ok(snaps[0].hash);
});

test('GV10 HTTP reproduce endpoint returns hashes', async () => {
  const app = express();
  app.use(express.json());
  registerAivosRoutes(app, {
    runtimeEnabled: true,
    governanceEnabled: true,
    marketplaceEnabled: true,
    forceNew: true,
    authenticateToken: (_q, _s, n) => n(),
  });
  const job = await getAivosRuntime().store.insertJob({ plugin_id: 'resume-ai', status: 'done' });
  await withServer(app, async (port) => {
    const res  = await fetch(`http://127.0.0.1:${port}/api/aivos/governance/jobs/${job.id}/reproduce`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.hashes);
  });
});

test('GV11 sha256Artifact is deterministic', () => {
  const h1 = sha256Artifact({ a: 1 });
  const h2 = sha256Artifact({ a: 1 });
  assert.equal(h1, h2);
});

test('GV12 governance module has no Kernel imports', () => {
  const dir = join(__dir, '../lib/aivos/governance');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"][^'"]*kernel[^'"]*['"]/i.test(src), `governance/${f} must not import Kernel`);
  }
});
