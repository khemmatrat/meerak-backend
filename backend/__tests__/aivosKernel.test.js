import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../lib/aivos/kernel/index.js';

process.env.AIVOS_KERNEL_ENABLED = '1';

function makeKernel(seed) {
  return createKernel({ seed });
}

test('K01 infer requires PolicyDecision and returns model slot', async () => {
  const kernel = makeKernel();
  await assert.rejects(() => kernel.modelRouter.infer({ taskType: 'writing' }), /policy_decision_required/);
  const out = await kernel.modelRouter.infer({
    taskType: 'writing',
    decision: { modelSlot: 'hermes3:3b' },
    compiledPrompt: { messages: [{ role: 'user', content: 'hi' }] },
    traceId: 't1',
  });
  assert.equal(out.model, 'hermes3:3b');
  assert.equal(out.taskType, 'writing');
});

test('K02 semantic memory upsert and search', async () => {
  const kernel = makeKernel();
  await kernel.memory.semantic.upsert('user-1', {
    namespace: 'resume-ai',
    contentType: 'hook',
    key: 'k1',
    content: { text: 'hello' },
  });
  const results = await kernel.memory.semantic.search('user-1', 'hello', { namespace: 'resume-ai', limit: 5 });
  assert.ok(results.length >= 1);
  assert.equal(results[0].content.text, 'hello');
});

test('K03 appendEpisode stores episodic memory', async () => {
  const kernel = makeKernel();
  const ep = await kernel.memory.appendEpisode('user-2', { type: 'event', body: 'x' });
  assert.equal(ep.user_id, 'user-2');
});

test('K04 quality engine produces scores and not blocked by default', async () => {
  const kernel = makeKernel();
  const res = await kernel.quality.score({ artifact: { draft: true }, context: { jobId: 'j1' } });
  assert.equal(res.blocked, false);
  assert.ok(res.scores.content_safety);
});

test('K05 cost optimizer estimates tokens and cost', () => {
  const kernel = makeKernel();
  const est = kernel.costOptimizer.estimate({ prompt: 'hello world' });
  assert.ok(est.tokens > 0);
  assert.ok(est.estimated_cost > 0);
});

test('K06 kernel factory gated by flag', async () => {
  process.env.AIVOS_KERNEL_ENABLED = '0';
  assert.throws(() => createKernel(), /aivos_kernel_disabled/);
  process.env.AIVOS_KERNEL_ENABLED = '1';
});
