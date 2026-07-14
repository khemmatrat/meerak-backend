import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../lib/aivos/runtime/index.js';

function makeRuntime({ enablePlugin = true } = {}) {
  process.env.AIVOS_RUNTIME_ENABLED = '1';
  process.env.AIVOS_KERNEL_ENABLED = '1';
  process.env.AIVOS_RESUME_PLUGIN_ENABLED = enablePlugin ? '1' : '0';
  return createRuntime({ syncExecute: true, forceResumePlugin: enablePlugin });
}

test('RP01 registers resume-ai plugin when flag enabled', () => {
  const runtime = makeRuntime({ enablePlugin: true });
  const row = runtime.store._tables.pluginRegistry.get('resume-ai');
  assert.ok(row, 'plugin registered');
  assert.equal(row.version, 1);
});

test('RP02 plugin job executes end-to-end via Runtime and Pipeline', async () => {
  const runtime = makeRuntime({ enablePlugin: true });
  const job = await runtime.taskRuntime.submitJob({
    pluginId: 'resume-ai',
    intent: { role: 'Engineer', goals: 'Ship product' },
  });
  assert.equal(job.status, 'preview');
  const plan = job.plan;
  assert.ok(plan?.dag?.nodes?.length === 15);
  const events = runtime.store._tables.events.filter((e) => e.correlation_id === job.id && e.name?.startsWith('aivos.pipeline.stage.'));
  assert.ok(events.length >= 10);
});

test('RP03 feature flag off blocks plugin path', async () => {
  const runtime = makeRuntime({ enablePlugin: false });
  await assert.rejects(
    () => runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'X', goals: 'Y' } }),
    (err) => err.code === 'PLUGIN_NOT_FOUND' || /plugin_not_registered/i.test(err.message || ''),
  );
});

test('RP04 capability discovery returns matched skills', async () => {
  const runtime = makeRuntime({ enablePlugin: true });
  const plan = await runtime.planner.buildPlan({ pluginId: 'resume-ai', intent: { role: 'QA', goals: 'Validate' }, jobId: 'plan-rp04' });
  assert.ok(plan.resolvedSkills.length >= 1);
  assert.ok(plan.skillBindings && Object.keys(plan.skillBindings).length >= 1);
});

test('RP05 plugin uses Prompt Compiler (no raw prompt)', async () => {
  const runtime = makeRuntime({ enablePlugin: true });
  const job = await runtime.taskRuntime.submitJob({ pluginId: 'resume-ai', intent: { role: 'PM', goals: 'Plan' } });
  assert.ok(job.promptCompilationId, 'prompt compilation recorded');
});
