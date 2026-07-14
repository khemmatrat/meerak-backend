import { isOrchestratorEnabled, ORCHESTRATOR_PHASE } from './config.js';
import { createAgentRegistry } from './agentRegistry.js';
import { createAgentRouter } from './agentRouter.js';
import { createAgentPlanner } from './agentPlanner.js';
import { createAgentMemory } from './agentMemory.js';
import { createAgentConversation } from './agentConversation.js';
import { createAgentConflictResolver } from './agentConflictResolver.js';
import { createAgentSupervisor } from './agentSupervisor.js';
import { createAgentMetrics } from './agentMetrics.js';
import { createAgentTimeline } from './agentTimeline.js';
import { createAgentRecovery } from './agentRecovery.js';
import { createAgentCoordinator } from './agentCoordinator.js';
import { createAgentExecution } from './agentExecution.js';

function disabledStub() {
  return {
    enabled: false,
    phase:   ORCHESTRATOR_PHASE,
    registry:   { listAgents: () => [], findAgent: () => null },
    planner:    { buildPlan: () => ({ nodes: [] }) },
    router:     { route: () => ({ ok: false, reason: 'orchestrator_disabled' }) },
    execute:    async () => ({ ok: false, reason: 'orchestrator_disabled' }),
    resume:     async () => ({ ok: false, reason: 'orchestrator_disabled' }),
    cancel:     async () => ({ ok: false, reason: 'orchestrator_disabled' }),
    getTimeline: () => null,
    getMetrics:  () => ({ totalRuns: 0 }),
    listAgents:  () => [],
  };
}

export function createOrchestratorEngine({
  runtime,
  store,
  skills,
  pipeline,
  checkpointManager,
  observability,
  governance,
  policyEngine,
  automation,
  analyticsEngine,
  billingEngine,
  events,
} = {}) {
  if (!isOrchestratorEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const resolvedSkills = skills || runtime?.skills;
  const resolvedPipeline = pipeline || runtime?.pipeline;

  const registry = createAgentRegistry({ store: resolvedStore, skills: resolvedSkills });
  const router = createAgentRouter({ skills: resolvedSkills });
  const planner = createAgentPlanner({ router, pipeline: resolvedPipeline });
  const metrics = createAgentMetrics();
  const timeline = createAgentTimeline({ observability: observability || runtime?.observability });
  const recovery = createAgentRecovery({
    checkpointManager: checkpointManager || runtime?.checkpointManager,
    store: resolvedStore,
  });
  const supervisor = createAgentSupervisor({
    automation: automation || runtime?.automationEngine,
    events: events || runtime?.events,
  });
  const conflictResolver = createAgentConflictResolver({
    governance: governance || runtime?.governance,
    policyEngine: policyEngine || runtime?.policyEngine,
  });

  const coordinator = createAgentCoordinator({
    supervisor,
    conflictResolver,
    timeline,
    metrics,
    recovery,
  });

  const execution = createAgentExecution({
    store: resolvedStore,
    planner,
    coordinator,
    memoryFactory: (initial) => createAgentMemory(initial),
    conversationFactory: (memory) => createAgentConversation({ memory }),
    timeline,
    metrics,
    recovery,
    registry,
    events: events || runtime?.events,
    billingEngine: billingEngine || runtime?.billingEngine,
    analyticsEngine: analyticsEngine || runtime?.analyticsEngine,
  });

  const engine = {
    enabled: true,
    phase:   ORCHESTRATOR_PHASE,
    registry,
    router,
    planner,
    coordinator,
    memory:       createAgentMemory(),
    conversation: null,
    conflictResolver,
    supervisor,
    metrics,
    timeline,
    recovery,
    execute:      (opts) => execution.execute(opts),
    resume:       (runId) => execution.resume(runId),
    cancel:       (runId) => execution.cancel(runId),
    getTimeline:  (runId) => timeline.getTimeline(runId),
    getMetrics:   (opts) => metrics.getMetrics(opts),
    listAgents:   () => registry.listAgents(),
    getRun:       (runId) => execution.getRun(runId),
    listRuns:     () => execution.listRuns(),
  };

  if (runtime) runtime.orchestrator = engine;
  return engine;
}

export {
  isOrchestratorEnabled,
  ORCHESTRATOR_PHASE,
  createAgentRegistry,
  createAgentRouter,
  createAgentPlanner,
  createAgentMemory,
  createAgentCoordinator,
  createAgentExecution,
};
