import { getWorkflowTemplate } from './workflowTemplate.js';

function ensureExecutions(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.workflowExecutions) store._tables.workflowExecutions = new Map();
  return store._tables.workflowExecutions;
}

function buildNodePlan(compiled, manifest) {
  const nodes = [];
  if (manifest.skill) {
    nodes.push({ id: 'node-skill', type: 'skill', skillId: manifest.skill });
  }
  for (const cap of manifest.requiredCapabilities || []) {
    nodes.push({ id: `node-orch-${cap}`, type: 'orchestrator', capability: cap });
  }
  for (const n of compiled?.dag?.nodes || []) {
    nodes.push({ id: `node-pipeline-${n.id}`, type: 'pipeline', pipelineNode: n.id });
  }
  return nodes;
}

export function createWorkflowExecutor({
  store,
  compiler,
  resolver,
  variables,
  orchestrator,
  checkpointManager,
  metrics,
  audit,
  versioning,
  billingEngine,
  observability,
  events,
  registry,
  skills,
} = {}) {
  async function emit(name, payload) {
    if (events?.emit) {
      await events.emit({
        name,
        correlationId: payload.executionId || 'workflow',
        source:        { runtimeJobId: payload.executionId || null },
        payload,
      }).catch(() => {});
    }
  }

  async function checkpointState(executionId, payload) {
    if (checkpointManager?.appendCheckpoint) {
      await checkpointManager.appendCheckpoint({
        workflowJobId: executionId,
        nodeId:        'workflow',
        checkpointKey: 'workflow_state',
        payload,
        attempt:       1,
      });
    }
  }

  async function runNode(node, ctx) {
    const chain = [...(ctx.chain || [])];
    const step = { nodeId: node.id, type: node.type, status: 'completed', at: new Date().toISOString() };

    if (node.type === 'skill') {
      chain.push('workflow', 'skill');
      const skillRow = skills?.registry?.findSkill?.(node.skillId);
      if (skillRow?.enabled) chain.push(`skill:${node.skillId}`);
    } else if (node.type === 'orchestrator') {
      chain.push('orchestrator', `orchestrator:${node.capability}`);
      if (!ctx.orchStarted && orchestrator?.enabled) {
        ctx.orchStarted = true;
        ctx.orchResult = await orchestrator.execute({
          capabilities: ctx.manifest.requiredCapabilities,
          intent:       { runId: ctx.executionId, ...ctx.resolvedVars },
          userId:       ctx.userId,
        });
      }
    } else if (node.type === 'pipeline') {
      chain.push('pipeline', node.pipelineNode);
      if (node.pipelineNode === 'render') chain.push('render');
      if (node.pipelineNode === 'publish') chain.push('publish');
    }

    step.chain = [...chain];
    return { step, chain };
  }

  async function executeInternal(opts = {}) {
    const {
      manifest,
      input = {},
      userId = null,
      executionId = null,
      completedNodeIds = [],
      maxNodesBeforePause = null,
      parentExecutionId = null,
      inheritedVars = null,
      nestedDepth = 0,
    } = opts;

    const check = await resolver.resolve(manifest, { userId, strictInstalled: false });
    if (!check.ok) {
      const err = new Error('workflow_dependency_gap');
      err.code = 'WORKFLOW_DEPENDENCY_GAP';
      err.details = check.gaps;
      throw err;
    }

    const varCtx = variables.buildContext({
      input,
      system:   { userId, at: new Date().toISOString(), parentExecutionId },
      runtime:  { workflowId: manifest.id, version: manifest.version },
      memory:   inheritedVars || {},
    });
    const resolvedVars = { ...(inheritedVars || {}), ...variables.resolve(manifest, varCtx) };
    const started = Date.now();
    const execId = executionId || `wfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const completed = new Set(completedNodeIds);
    const executedThisRun = [];
    const timeline = [];
    let chain = [];
    let orchResult = null;

    const compiled = await compiler.compile(manifest, { intent: resolvedVars, jobId: execId });
    const nodePlan = buildNodePlan(compiled, manifest);

    const ctx = {
      executionId: execId,
      manifest,
      resolvedVars,
      userId,
      chain,
      orchStarted: false,
      orchResult:  null,
    };

    for (const node of nodePlan) {
      if (completed.has(node.id)) continue;

      const { step, chain: nextChain } = await runNode(node, ctx);
      ctx.chain = nextChain;
      chain = nextChain;
      orchResult = ctx.orchResult;
      completed.add(node.id);
      executedThisRun.push(node.id);
      timeline.push(step);

      await checkpointState(execId, {
        manifestId:       manifest.id,
        manifestVersion:  manifest.version,
        variables:        resolvedVars,
        completedNodeIds: [...completed],
        timeline,
        chain,
        parentExecutionId,
        nestedDepth,
      });

      if (maxNodesBeforePause != null && executedThisRun.length >= maxNodesBeforePause) {
        const row = {
          executionId:      execId,
          workflowId:       manifest.id,
          status:           'paused',
          compiled,
          variables:        resolvedVars,
          completedNodeIds: [...completed],
          executedThisRun,
          timeline,
          chain,
          parentExecutionId,
        };
        ensureExecutions(store)?.set(execId, row);
        audit.recordExecution({ executionId: execId, workflowId: manifest.id, status: 'paused', timeline, variables: resolvedVars });
        return { ok: true, ...row, resumed: false };
      }
    }

    const nestedResults = [];
    for (const childId of manifest.nestedWorkflows || []) {
      const childManifest = registry?.findWorkflow?.(childId)?.manifest || getWorkflowTemplate(childId);
      if (!childManifest) continue;
      const childResult = await executeInternal({
        manifest:          childManifest,
        input,
        userId,
        parentExecutionId: execId,
        inheritedVars:     resolvedVars,
        nestedDepth:       nestedDepth + 1,
      });
      nestedResults.push(childResult);
      resolvedVars[`nested:${childId}`] = childResult.outputs;
      timeline.push(...(childResult.timeline || []).map((s) => ({ ...s, nested: childId })));
      await checkpointState(execId, {
        manifestId: manifest.id,
        variables: resolvedVars,
        completedNodeIds: [...completed],
        timeline,
        nestedResults: nestedResults.map((n) => n.executionId),
        chain,
      });
    }

    if (observability?.startSpan) {
      observability.startSpan({ name: 'aivos.workflow.execute', runtimeJobId: execId, attributes: { workflowId: manifest.id } });
    }

    const latencyMs = Date.now() - started;
    let cost = 0;
    if (billingEngine?.enabled && userId) cost = 0.05;

    const outputs = {};
    for (const key of manifest.outputs || []) {
      outputs[key] = { generated: true, workflowId: manifest.id, version: manifest.version };
    }

    metrics.record({ workflowId: manifest.id, success: true, latencyMs, cost });
    versioning.snapshot(manifest.id, manifest);
    audit.recordExecution({ executionId: execId, workflowId: manifest.id, status: 'completed', timeline, variables: resolvedVars });
    await emit('aivos.workflow.completed', { executionId: execId, workflowId: manifest.id });

    const row = {
      executionId:      execId,
      workflowId:       manifest.id,
      status:           'completed',
      compiled,
      orchResult,
      nestedResults,
      outputs,
      variables:        resolvedVars,
      completedNodeIds: [...completed],
      executedThisRun,
      timeline,
      chain,
      latencyMs,
      cost,
      parentExecutionId,
    };
    ensureExecutions(store)?.set(execId, row);
    return { ok: true, ...row, resumed: !!executionId && completedNodeIds.length > 0 };
  }

  return {
    execute: (opts) => executeInternal(opts),

    async resume(executionId) {
      const row = ensureExecutions(store)?.get(executionId);
      if (!row) {
        const err = new Error('workflow_execution_not_found');
        err.code = 'WORKFLOW_EXECUTION_NOT_FOUND';
        throw err;
      }

      let checkpoint = null;
      if (checkpointManager?.latestCheckpoint) {
        checkpoint = await checkpointManager.latestCheckpoint(executionId, 'workflow');
      }

      const completedNodeIds = checkpoint?.payload?.completedNodeIds || row.completedNodeIds || [];
      const manifest = registry?.findWorkflow?.(row.workflowId)?.manifest
        || getWorkflowTemplate(row.workflowId)
        || { id: row.workflowId, outputs: Object.keys(row.outputs || {}) };

      const result = await executeInternal({
        manifest,
        input:            row.variables || {},
        userId:           row.variables?.userId,
        executionId,
        completedNodeIds,
        inheritedVars:    checkpoint?.payload?.variables || row.variables,
      });

      result.resumedFrom = checkpoint?.payload || null;
      result.skippedNodeIds = completedNodeIds.filter((id) => !result.executedThisRun.includes(id));
      return result;
    },
  };
}
