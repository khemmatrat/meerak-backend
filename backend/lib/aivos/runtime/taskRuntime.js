import { randomUUID } from 'crypto';
import { RUNTIME_JOB_STATUS } from './types.js';
import { detectRawPrompt } from './promptCompiler.js';

export function createTaskRuntime(deps) {
  const {
    store,
    contextManager,
    planner,
    policyEngine,
    promptCompiler,
    executionRuntime,
    approvalGate,
    events,
    governance,
    enqueueJob,
    syncExecute = true,
    billingEngine,
  } = deps;

  async function submitJob({ userId, pluginId, intent, options = {} }) {
    const rawKey = detectRawPrompt(intent);
    if (rawKey) {
      const err = new Error('raw_prompt_rejected');
      err.code = 'RAW_PROMPT_REJECTED';
      err.field = rawKey;
      throw err;
    }

    if (billingEngine?.enabled) {
      await billingEngine.checkCredits({ userId, pluginId });
    }

    const traceId = options.traceId || randomUUID();
    const job = await store.insertJob({
      user_id: userId || null,
      plugin_id: pluginId,
      status: RUNTIME_JOB_STATUS.QUEUED,
      approval_state: 'draft',
      intent,
      trace_id: traceId,
      metadata: options.metadata || {},
    });

    await approvalGate.ensureRequest(job.id);

    if (events) {
      await events.emit({
        name: 'aivos.runtime.job.created',
        correlationId: job.id,
        traceId,
        source: { agentId: 'task-runtime', runtimeJobId: job.id },
        payload: { pluginId, userId },
      });
    }

    await store.updateJob(job.id, { status: RUNTIME_JOB_STATUS.PLANNING });
    const contextSnap = await contextManager.capture({
      jobId: job.id,
      intent,
      metadata: { pluginId, userId },
    });

    const planDraft = await planner.buildPlan({ pluginId, intent, jobId: job.id });
    const primarySkill = planDraft.resolvedSkills[0];
    const taskType = primarySkill?.taskTypes?.[0] || 'writing';

    const policyResult = await policyEngine.resolve({
      jobId: job.id,
      pluginId,
      taskType,
      intent,
      traceId,
      userTier: options.userTier || 'standard',
    });

    const compilation = await promptCompiler.compile({
      jobId: job.id,
      intent,
      skillId: primarySkill?.skillId,
      promptId: primarySkill?.promptId || 'talent-resume-draft',
      promptVersion: primarySkill?.promptVersion || 1,
      contextSnapshotId: contextSnap.id,
      traceId,
    });

    const plan = await store.insertPlan({
      job_id: job.id,
      workflow_template_id: planDraft.workflowTemplateId,
      dag: planDraft.dag,
      skill_bindings: planDraft.skillBindings,
      version: 1,
    });

    await governance.auditVersionChange({
      entityType: 'runtime_plan',
      entityId: plan.id,
      entityVersion: 1,
      action: 'created',
      jobId: job.id,
      diff: { skillBindings: planDraft.skillBindings },
    });

    await store.updateJob(job.id, {
      status: RUNTIME_JOB_STATUS.EXECUTING,
      context_snapshot_id: contextSnap.id,
      plan_id: plan.id,
      policy_decision_id: policyResult.decisionId,
      prompt_compilation_id: compilation.compilation.id,
    });

    const execute = async () => {
      await executionRuntime.run({
        jobId: job.id,
        plan: { ...planDraft, id: plan.id },
        traceId,
      });
      await store.updateJob(job.id, { status: RUNTIME_JOB_STATUS.PREVIEW });
    };

    if (syncExecute) {
      await execute();
    } else if (typeof enqueueJob === 'function') {
      await enqueueJob({ jobId: job.id, traceId });
    }

    if (billingEngine?.enabled) {
      await billingEngine.meterUsage({ jobId: job.id, userId, pluginId });
    }

    return getJob(job.id);
  }

  async function getJob(jobId) {
    const job = await store.getJob(jobId);
    if (!job) return null;
    const plan = job.plan_id ? await store.getPlan(job.plan_id) : await store.getPlanByJobId(jobId);
    const approval = await store.getApprovalByJobId(jobId);
    return {
      id: job.id,
      status: job.status,
      approvalState: job.approval_state,
      pluginId: job.plugin_id,
      intent: job.intent,
      traceId: job.trace_id,
      planId: job.plan_id,
      contextSnapshotId: job.context_snapshot_id,
      policyDecisionId: job.policy_decision_id,
      promptCompilationId: job.prompt_compilation_id,
      plan,
      approval,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    };
  }

  return {
    submitJob,
    getJob,
    approve: (jobId, userId) => approvalGate.approve(jobId, userId),
    reject: (jobId, userId) => approvalGate.reject(jobId, userId),
    reprompt: (jobId, intent, userId) => approvalGate.reprompt(jobId, intent, userId),
  };
}
