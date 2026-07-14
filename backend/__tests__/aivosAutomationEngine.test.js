import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIVOS_AUTOMATION_ENABLED = '1';
process.env.AIVOS_AUTO_PUBLISH = '1';
process.env.AIVOS_AUTOMATION_SAFETY_LEVEL = 'standard';
process.env.AIVOS_AUTOMATION_MAX_ACTIONS_PER_HOUR = '1000';
process.env.AIVOS_ANALYTICS_ENABLED = '1';
process.env.AIVOS_LEARNING_ENABLED = '1';
process.env.AIVOS_OPTIMIZATION_ENABLED = '1';
process.env.AIVOS_PUBLISH_ENABLED = '1';

import { createAutomationEngine }    from '../lib/aivos/automation/index.js';
import { createRuleEngine }          from '../lib/aivos/automation/ruleEngine.js';
import { createConstraintEngine }    from '../lib/aivos/automation/constraintEngine.js';
import { createGoalEngine }          from '../lib/aivos/automation/goalEngine.js';
import { createTriggerEngine }       from '../lib/aivos/automation/triggerEngine.js';
import { createAutomationScheduler } from '../lib/aivos/automation/scheduler.js';
import { createWorkflowAutomation }  from '../lib/aivos/automation/workflowAutomation.js';
import { createAutoRetry }           from '../lib/aivos/automation/autoRetry.js';
import { createAutoRecovery }        from '../lib/aivos/automation/autoRecovery.js';
import { createAutoScaling }         from '../lib/aivos/automation/autoScaling.js';
import { createNotificationEngine }  from '../lib/aivos/automation/notificationEngine.js';
import { createApprovalAutomation }  from '../lib/aivos/automation/approvalAutomation.js';
import { createSafetyGuard }         from '../lib/aivos/automation/safetyGuard.js';
import { createAutomationAudit }     from '../lib/aivos/automation/automationAudit.js';
import { createEventAutomation }     from '../lib/aivos/automation/eventAutomation.js';
import { createCampaignAutomation }  from '../lib/aivos/automation/campaignAutomation.js';
import { createAutoPublish }         from '../lib/aivos/automation/autoPublish.js';
import { createPolicyOverride }      from '../lib/aivos/automation/policyOverride.js';
import { isAutomationEnabled, isAutoPublishEnabled } from '../lib/aivos/automation/config.js';

// ── AUT01: config flags ───────────────────────────────────────────────────────
test('AUT01 automation config flags load correctly', () => {
  assert.equal(isAutomationEnabled(), true);
  assert.equal(isAutoPublishEnabled(), true);
});

// ── AUT02: rule engine evaluate ───────────────────────────────────────────────
test('AUT02 rule engine registers and evaluates rules', () => {
  const engine = createRuleEngine();
  engine.register({ id: 'r1', name: 'Test rule', condition: (ctx) => ctx.value > 10, action: 'notify', params: { msg: 'hi' }, priority: 5 });
  engine.register({ id: 'r2', name: 'Low priority', condition: (ctx) => ctx.value > 5, action: 'log', params: {}, priority: 1 });

  const matched = engine.evaluate({ value: 15 });
  assert.ok(matched.length >= 2, 'both rules should match');
  assert.equal(matched[0].priority >= matched[1].priority, true, 'sorted by priority desc');

  const noMatch = engine.evaluate({ value: 3 });
  assert.equal(noMatch.length, 0, 'no match below threshold');

  engine.disable('r1');
  const afterDisable = engine.evaluate({ value: 15 });
  assert.ok(afterDisable.every((m) => m.ruleId !== 'r1'), 'disabled rule should not fire');
});

// ── AUT03: constraint engine ──────────────────────────────────────────────────
test('AUT03 constraint engine blocks violating actions', () => {
  const engine = createConstraintEngine();
  engine.register({ id: 'budget_cap', description: 'Max $1000', check: ({ context }) => (context.amount || 0) <= 1000 });

  const ok = engine.validate({ action: 'spend', context: { amount: 500 } });
  assert.equal(ok.allowed, true);

  const blocked = engine.validate({ action: 'spend', context: { amount: 2000 } });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.violations.includes('budget_cap'));
});

// ── AUT04: goal engine ────────────────────────────────────────────────────────
test('AUT04 goal engine tracks progress and detects completion', () => {
  let completed = false;
  const engine = createGoalEngine();
  engine.define({ id: 'weekly_publish', name: 'Publish 5 videos/week', metric: 'publishes', target: 5, onComplete: () => { completed = true; } });

  engine.record('weekly_publish', 3);
  const mid = engine.get('weekly_publish');
  assert.equal(mid.current, 3);
  assert.equal(mid.pct, 0.6);
  assert.equal(mid.status, 'in_progress');

  engine.record('weekly_publish', 2);
  assert.equal(completed, true, 'onComplete should fire when target reached');
});

// ── AUT05: trigger engine ─────────────────────────────────────────────────────
test('AUT05 trigger engine fires on matching event type', async () => {
  const engine = createTriggerEngine();
  const fired = [];
  engine.register({ id: 't1', type: 'event', event: 'job.complete', handler: async (env) => { fired.push(env); return { ok: true }; } });
  engine.register({ id: 't2', type: 'event', event: 'job.failed',   handler: async () => ({ ok: true }) });

  await engine.processEvent({ type: 'job.complete', jobId: 'j1' });
  assert.equal(fired.length, 1, 'only matching trigger should fire');
  assert.equal(fired[0].type, 'job.complete');

  // Manual fire
  const result = await engine.fire('t2', { jobId: 'j_fail' });
  assert.equal(result.triggerId, 't2');
});

// ── AUT06: workflow automation ────────────────────────────────────────────────
test('AUT06 workflow automation executes multi-step workflow', async () => {
  const engine = createWorkflowAutomation();
  engine.register({
    id: 'content_pipeline',
    name: 'Content pipeline',
    steps: [
      { id: 'plan',   run: async (ctx) => ({ plan: 'done' }) },
      { id: 'create', run: async (ctx) => ({ content: 'created' }) },
      { id: 'review', run: async (ctx) => ({ reviewed: true }) },
    ],
  });

  const run = await engine.execute('content_pipeline', { brand: 'AQOND' });
  assert.equal(run.status, 'complete');
  assert.equal(run.steps.length, 3);
  assert.ok(run.steps.every((s) => s.status === 'ok'));
  assert.equal(run.context.plan, 'done');
  assert.equal(run.context.content, 'created');
});

test('AUT06b workflow halts on step error with onError=halt', async () => {
  const engine = createWorkflowAutomation();
  engine.register({
    id: 'failing_wf',
    steps: [
      { id: 's1', run: async () => ({}) },
      { id: 's2', run: async () => { throw new Error('step_failed'); }, onError: 'halt' },
      { id: 's3', run: async () => ({}) },
    ],
  });
  const run = await engine.execute('failing_wf', {});
  assert.equal(run.status, 'failed');
  assert.equal(run.steps.length, 2, 's3 should not run after halt');
});

// ── AUT07: auto retry ─────────────────────────────────────────────────────────
test('AUT07 auto retry retries on failure and succeeds on nth attempt', async () => {
  const retrier = createAutoRetry();
  let attempts = 0;
  const result = await retrier.withRetry(async (n) => {
    attempts++;
    if (n < 3) throw new Error('transient');
    return { done: true };
  }, { maxAttempts: 3, baseDelayMs: 1, id: 'test_retry' });

  assert.equal(result.done, true);
  assert.equal(attempts, 3);
  const h = retrier.history();
  assert.equal(h.filter((e) => e.status === 'error').length, 2);
  assert.equal(h.filter((e) => e.status === 'ok').length, 1);
});

test('AUT07b auto retry throws after max attempts', async () => {
  const retrier = createAutoRetry();
  await assert.rejects(
    () => retrier.withRetry(async () => { throw new Error('always_fail'); }, { maxAttempts: 2, baseDelayMs: 1 }),
    /always_fail/,
  );
});

// ── AUT08: auto scaling ───────────────────────────────────────────────────────
test('AUT08 auto scaling scales up on high queue depth', () => {
  const scaler = createAutoScaling();
  const initial = scaler.getConcurrency();

  for (let i = 0; i < 5; i++) scaler.observe({ queueDepth: initial * 4, avgLatencyMs: 200, errorRate: 0 });
  const decision = scaler.evaluate();
  assert.equal(decision.action, 'scale_up', 'should scale up on deep queue');
  assert.ok(scaler.getConcurrency() > initial);
});

test('AUT08b auto scaling scales down on low queue depth', () => {
  const scaler = createAutoScaling();
  for (let i = 0; i < 5; i++) scaler.observe({ queueDepth: 0, avgLatencyMs: 100, errorRate: 0 });
  const decision = scaler.evaluate();
  assert.equal(decision.action, 'scale_down', 'should scale down on empty queue');
});

// ── AUT09: notification engine ────────────────────────────────────────────────
test('AUT09 notification engine sends to registered channel', async () => {
  const engine = createNotificationEngine();
  const received = [];
  engine.registerChannel('in_memory', async (n) => { received.push(n); return { sent: true }; });

  const result = await engine.send({ type: 'alert', title: 'Test Alert', body: 'Something happened' });
  assert.ok(result.notificationId);
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'alert');
});

// ── AUT10: approval automation ────────────────────────────────────────────────
test('AUT10 approval automation auto-approves via rule', async () => {
  const rules = createRuleEngine();
  rules.register({ id: 'approve_standard', name: 'Auto-approve standard', condition: (ctx) => ctx.approvalType === 'publish', action: 'auto_approve', priority: 10 });

  const approvals = createApprovalAutomation({ ruleEngine: rules });
  const result = await approvals.submit({ type: 'publish', payload: { jobId: 'j1' }, requestedBy: 'system' });
  assert.equal(result.decision, 'approved', 'should auto-approve via rule');
  assert.equal(result.reason, 'Auto-approve standard');
});

test('AUT10b approval automation escalates when no rule matches', async () => {
  const rules = createRuleEngine(); // no rules registered
  const notifications = createNotificationEngine();
  const received = [];
  notifications.registerChannel('test', async (n) => { received.push(n); });

  const approvals = createApprovalAutomation({ ruleEngine: rules, notificationEngine: notifications });
  const result = await approvals.submit({ type: 'budget_override', payload: { amount: 50000 }, requestedBy: 'user_1' });
  assert.equal(result.decision, 'escalated');
  assert.equal(received.length, 1, 'should notify on escalation');
});

// ── AUT11: safety guard ───────────────────────────────────────────────────────
test('AUT11 safety guard blocks blocklisted actions', () => {
  const guard = createSafetyGuard();
  const r1 = guard.check({ action: 'delete_all', context: {} });
  assert.equal(r1.allowed, false);
  assert.equal(r1.reason, 'blocklisted');

  const r2 = guard.check({ action: 'publish', context: {} });
  assert.equal(r2.allowed, true);
});

// ── AUT12: audit log ──────────────────────────────────────────────────────────
test('AUT12 automation audit records and queries entries', () => {
  const audit = createAutomationAudit();
  audit.log({ type: 'workflow_executed', workflowId: 'wf1' });
  audit.log({ type: 'auto_publish',      jobId: 'j1' });
  audit.log({ type: 'workflow_executed', workflowId: 'wf2' });

  const all = audit.all();
  assert.equal(all.length, 3);

  const workflows = audit.query({ type: 'workflow_executed' });
  assert.equal(workflows.length, 2);

  const summary = audit.summary();
  assert.equal(summary.total, 3);
  assert.equal(summary.byType['workflow_executed'], 2);
  assert.equal(summary.byType['auto_publish'], 1);
});

// ── AUT13: campaign automation ────────────────────────────────────────────────
test('AUT13 campaign automation defines and runs one cycle', async () => {
  const engine = createCampaignAutomation();
  engine.define({ id: 'daily_tiktok', name: 'Daily TikTok', platforms: ['tiktok'], intervalMs: 86400000, contentTemplate: {} });

  const result = await engine.runCycle('daily_tiktok');
  assert.equal(result.campaignId, 'daily_tiktok');
  assert.equal(result.publishCount, 1);

  const stats = engine.getStats('daily_tiktok');
  assert.equal(stats.publishCount, 1);
  assert.ok(stats.lastPublished);
});

// ── AUT14: full automation engine factory + event bus integration ─────────────
test('AUT14 createAutomationEngine wires all components', () => {
  const engine = createAutomationEngine();
  assert.equal(engine.enabled, true);

  // Verify all sub-engines present
  assert.ok(engine.rules, 'rules');
  assert.ok(engine.constraints, 'constraints');
  assert.ok(engine.policyOverride, 'policyOverride');
  assert.ok(engine.goals, 'goals');
  assert.ok(engine.triggers, 'triggers');
  assert.ok(engine.scheduler, 'scheduler');
  assert.ok(engine.events, 'events');
  assert.ok(engine.workflows, 'workflows');
  assert.ok(engine.campaigns, 'campaigns');
  assert.ok(engine.autoPublish, 'autoPublish');
  assert.ok(engine.retry, 'retry');
  assert.ok(engine.recovery, 'recovery');
  assert.ok(engine.scaling, 'scaling');
  assert.ok(engine.notifications, 'notifications');
  assert.ok(engine.approvals, 'approvals');
  assert.ok(engine.safety, 'safety');
  assert.ok(engine.audit, 'audit');
  assert.equal(typeof engine.consumeEvent, 'function');

  // Bootstrap rules should be registered
  const rules = engine.rules.list();
  assert.ok(rules.length >= 2, 'default rules should be bootstrapped');
});

test('AUT14b disabled automation engine returns stub', () => {
  const orig = process.env.AIVOS_AUTOMATION_ENABLED;
  process.env.AIVOS_AUTOMATION_ENABLED = '0';
  assert.equal(isAutomationEnabled(), false);
  const stub = createAutomationEngine();
  assert.equal(stub.enabled, false);
  assert.equal(stub.rules, null);
  process.env.AIVOS_AUTOMATION_ENABLED = orig;
});

test('AUT14c consumeEvent dispatches ACP event to event automation', async () => {
  const engine = createAutomationEngine();
  const fired = [];
  engine.triggers.register({ id: 'test_trigger', type: 'event', event: 'job.complete', handler: async (env) => { fired.push(env); return { ok: true }; } });
  await engine.consumeEvent({ type: 'job.complete', jobId: 'j99' });
  assert.equal(fired.length, 1);
  assert.equal(fired[0].jobId, 'j99');
});
