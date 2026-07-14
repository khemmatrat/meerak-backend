import { isAutomationEnabled } from './config.js';
import { createRuleEngine }          from './ruleEngine.js';
import { createConstraintEngine }    from './constraintEngine.js';
import { createPolicyOverride }      from './policyOverride.js';
import { createGoalEngine }          from './goalEngine.js';
import { createTriggerEngine }       from './triggerEngine.js';
import { createAutomationScheduler } from './scheduler.js';
import { createEventAutomation }     from './eventAutomation.js';
import { createWorkflowAutomation }  from './workflowAutomation.js';
import { createCampaignAutomation }  from './campaignAutomation.js';
import { createAutoPublish }         from './autoPublish.js';
import { createAutoRetry }           from './autoRetry.js';
import { createAutoRecovery }        from './autoRecovery.js';
import { createAutoScaling }         from './autoScaling.js';
import { createNotificationEngine }  from './notificationEngine.js';
import { createApprovalAutomation }  from './approvalAutomation.js';
import { createSafetyGuard }         from './safetyGuard.js';
import { createAutomationAudit }     from './automationAudit.js';

/**
 * Create the full Automation Engine.
 *
 * Reuses: Runtime, Kernel, Analytics, Learning, Optimization, Pipeline, Publish.
 *
 * @param {object} deps
 * @returns {AutomationEngine}
 */
export function createAutomationEngine(deps = {}) {
  if (!isAutomationEnabled()) {
    return {
      enabled: false,
      rules: null, constraints: null, policyOverride: null, goals: null,
      triggers: null, scheduler: null, events: null, workflows: null,
      campaigns: null, autoPublish: null, retry: null, recovery: null,
      scaling: null, notifications: null, approvals: null, safety: null, audit: null,
    };
  }

  // ── Foundation (no deps) ───────────────────────────────────────────────────
  const audit       = createAutomationAudit();
  const safety      = createSafetyGuard({ automationAudit: audit });
  const rules       = createRuleEngine();
  const constraints = createConstraintEngine();
  const policyOverride = createPolicyOverride({ automationAudit: audit });
  const goals       = createGoalEngine();
  const scheduler   = createAutomationScheduler({ bullQueue: deps.bullQueue || null });
  const notifications = createNotificationEngine();

  // Register default safety constraint: every action must pass safety guard
  constraints.register({
    id: 'safety_guard',
    description: 'Action must pass safety guard check',
    check: ({ action, context }) => safety.check({ action, context }).allowed,
  });

  // ── Event / Workflow layer ─────────────────────────────────────────────────
  const triggers  = createTriggerEngine();
  const events    = createEventAutomation({ triggerEngine: triggers, automationAudit: audit });
  const workflows = createWorkflowAutomation({ ruleEngine: rules, constraintEngine: constraints, automationAudit: audit });

  // ── Campaign / Publish ─────────────────────────────────────────────────────
  const autoPublish = createAutoPublish({
    publishEngine:    deps.publishEngine    || null,
    safetyGuard:      safety,
    constraintEngine: constraints,
    automationAudit:  audit,
  });
  const campaigns = createCampaignAutomation({
    publishEngine:   deps.publishEngine || null,
    goalEngine:      goals,
    scheduler,
    automationAudit: audit,
  });

  // ── Resilience ─────────────────────────────────────────────────────────────
  const retry    = createAutoRetry({ automationAudit: audit });
  const recovery = createAutoRecovery({ pipeline: deps.pipeline || null, automationAudit: audit });
  const scaling  = createAutoScaling({ automationAudit: audit });

  // ── Approval ───────────────────────────────────────────────────────────────
  const approvals = createApprovalAutomation({ ruleEngine: rules, notificationEngine: notifications, automationAudit: audit });

  /**
   * Consume an ACP runtime event (called by Runtime event bus wrapper).
   * @param {object} envelope
   */
  async function consumeEvent(envelope) {
    return events.consume(envelope);
  }

  /**
   * Register default built-in rules and triggers.
   * Called once during engine boot.
   */
  function _bootstrap() {
    // Auto-approve low-risk content publishes
    rules.register({
      id: 'auto_approve_low_risk',
      name: 'Auto-approve standard publish requests',
      condition: (ctx) => ctx.approvalType === 'publish' && ctx.payload?.risk !== 'high',
      action: 'auto_approve',
      priority: 10,
    });

    // Auto-reject obviously invalid budgets
    rules.register({
      id: 'auto_reject_negative_budget',
      name: 'Reject negative budget requests',
      condition: (ctx) => ctx.approvalType === 'budget' && (ctx.payload?.amount || 0) < 0,
      action: 'auto_reject',
      priority: 20,
    });
  }
  _bootstrap();

  return {
    enabled: true,
    rules, constraints, policyOverride, goals,
    triggers, scheduler, events, workflows,
    campaigns, autoPublish,
    retry, recovery, scaling,
    notifications, approvals,
    safety, audit,
    consumeEvent,
  };
}

export default createAutomationEngine;
