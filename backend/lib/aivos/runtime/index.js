import { createRuntimeStore } from './runtimeStore.js';
import { createContextManager } from './contextManager.js';
import { createCheckpointManager } from './checkpointManager.js';
import { createRuntimeRegistry } from './runtimeRegistry.js';
import { createSkillGraph } from './skillGraph.js';
import { createCapabilityDiscovery } from './capabilityDiscovery.js';
import { createPlanner } from './planner.js';
import { createPolicyEngine } from './policyEngine.js';
import { createPromptCompiler } from './promptCompiler.js';
import { createRuntimeEvents } from './runtimeEvents.js';
import { createGovernance } from './governance.js';
import { createApprovalGate } from './approvalGate.js';
import { createObservability } from './observability.js';
import { createExecutionGraph } from './executionGraph.js';
import { createExecutionRuntime } from './executionRuntime.js';
import { createTaskRuntime } from './taskRuntime.js';
import { createCostDashboard } from './costDashboard.js';
import { createCreativeRuntime } from './creativeRuntime.js';
import { createMarketplace } from './marketplace.js';
import { createAcpValidator } from './acpValidator.js';
import { createPipeline } from '../pipeline/index.js';
import { isResumePluginEnabled } from '../config.js';
import { createAnalyticsEngine } from '../analytics/index.js';
import { createLearningEngine } from '../learning/index.js';
import { createOptimizationEngine } from '../optimization/index.js';
import { createAutomationEngine }   from '../automation/index.js';
import { createRevenueGrowthEngine } from '../revenue/index.js';
import { createBillingEngine } from '../billing/index.js';
import { createSkillEngine } from '../skill/index.js';
import { createOrchestratorEngine } from '../orchestrator/index.js';
import { createKnowledgeEngine } from '../knowledge/index.js';
import { createWorkflowEngine } from '../workflow/index.js';
import { createApplicationEngine } from '../application/index.js';
import { createTenantEngine } from '../tenant/index.js';
import { createIntegrationEngine } from '../integration/index.js';
import { createGrowthEngine } from '../growth/index.js';

const DEFAULT_SEED_BASE = {
  policyRules: [
    {
      id: 'rule-writing',
      task_type: 'writing',
      priority: 10,
      enabled: true,
      decision: { model: 'hermes3:3b', max_tokens: 2048, fallback: ['qwen2:7b'] },
    },
    {
      id: 'rule-structured',
      task_type: 'structured_json',
      priority: 10,
      enabled: true,
      decision: { model: 'hermes3:3b', max_tokens: 2048, fallback: ['qwen2:7b'] },
    },
  ],
  promptRegistry: [
    {
      id: 'talent-resume-draft',
      version: 1,
      template: { system: 'You are a resume assistant.', user: 'Draft for {{role}} with goals: {{goals}}' },
      required_slots: ['role', 'goals'],
      task_type: 'writing',
      enabled: true,
    },
  ],
  brandDna: [{ brand_key: 'aqond-default', version: 1, tone: 'professional', forbidden_phrases: ['guaranteed job'], locale: 'en' }],
  pluginRegistry: [],
  skillRegistry: [
    {
      skill_id: 'resume-extract-profile',
      version: 1,
      agent_id: 'resume-analyzer',
      capabilities: ['profile.analyze'],
      stage_affinity: ['extract', 'analyze'],
      prompt_id: 'talent-resume-draft',
      prompt_version: 1,
      task_types: ['structured_json'],
      enabled: true,
    },
  ],
};

export function createRuntime(deps = {}) {
  const seed = JSON.parse(JSON.stringify(deps.seed || DEFAULT_SEED_BASE));
  if (isResumePluginEnabled() || deps.forceResumePlugin) {
    seed.pluginRegistry.push({
      plugin_id: 'resume-ai',
      version: 1,
      capabilities: ['video.talent_intro', 'ocr.pdf', 'profile.analyze'],
      required_skills: ['resume-extract-profile'],
      enabled: true,
      policy_profile: { tier: 'standard' },
    });
  }
  if (!seed.skillRegistry.some((s) => s.skill_id === 'resume-extract-profile')) {
    seed.skillRegistry.push({
      skill_id: 'resume-extract-profile',
      version: 1,
      agent_id: 'resume-analyzer',
      capabilities: ['profile.analyze'],
      stage_affinity: ['extract', 'analyze'],
      prompt_id: 'talent-resume-draft',
      prompt_version: 1,
      task_types: ['structured_json'],
      enabled: true,
    });
  }
  if (!seed.promptRegistry.some((p) => p.id === 'talent-resume-draft')) {
    seed.promptRegistry.push({
      id: 'talent-resume-draft',
      version: 1,
      template: { system: 'You are a resume assistant.', user: 'Draft for {{role}} with goals: {{goals}}' },
      required_slots: ['role', 'goals'],
      task_type: 'writing',
      enabled: true,
    });
  }

  const store = deps.store || createRuntimeStore({ pool: deps.pool, seed });
  const events = createRuntimeEvents({ store, publishRedis: deps.publishRedis });

  // Analytics engine – optional; auto-forwards ACP events when enabled
  const analyticsEngine = deps.analyticsEngine || createAnalyticsEngine({
    storage: deps.analyticsStorage,
    publishHistory: deps.publishHistory,
  });
  if (analyticsEngine.enabled) {
    const _origEmit = events.emit.bind(events);
    events.emit = async function (params) {
      const result = await _origEmit(params);
      analyticsEngine.consumeRuntimeEvent(result?.envelope);
      // Learning engine also listens (wired after learningEngine is created below)
      if (events._learningEngine) {
        events._learningEngine.consumeEvent(result?.envelope);
      }
      return result;
    };
  }

  const registry = createRuntimeRegistry({ store });
  const skillGraph = createSkillGraph({ registry });
  const capabilityDiscovery = createCapabilityDiscovery({ registry, events });
  const planner = createPlanner({ capabilityDiscovery, skillGraph });
  const policyEngine = createPolicyEngine({ store, events });
  const promptCompiler = createPromptCompiler({ store, events });
  const governance = deps.governanceEngine || createGovernance({ store, events });
  const approvalGate = createApprovalGate({ store, events });
  const observability = createObservability({ store });
  const contextManager = createContextManager({ store });
  const checkpointManager = createCheckpointManager({ store });
  const executionGraph = createExecutionGraph({ store, checkpointManager, events, observability });
  const pipeline = createPipeline({ store, checkpointManager, events, observability, mediaEngine: deps.mediaEngine });
  const executionRuntime = createExecutionRuntime({ executionGraph, approvalGate, pipelineExecutor: pipeline.executor, pipelineTemplate: pipeline.template });
  const costDashboard = createCostDashboard({ store });

  let billingEngine;
  const marketplace = createMarketplace({
    store,
    events,
    getBillingEngine:    () => billingEngine,
    getGovernanceEngine: () => governance,
  });
  billingEngine = deps.billingEngine || createBillingEngine({
    growthEngine:   deps.growthEngine,
    costDashboard,
    marketplace,
    store,
  });

  const taskRuntime = createTaskRuntime({
    store,
    contextManager,
    planner,
    policyEngine,
    promptCompiler,
    executionRuntime,
    approvalGate,
    events,
    governance,
    billingEngine,
    enqueueJob: deps.enqueueJob,
    syncExecute: deps.syncExecute !== false,
  });
  const creativeRuntime = createCreativeRuntime();
  const learningEngine = createLearningEngine({ store, events, analyticsEngine, kernel: deps.kernel });
  // Wire learningEngine into the events emitter (set after creation to avoid circular ref)
  events._learningEngine = learningEngine;

  // Optimization engine – consumes Learning + Analytics outputs
  const optimizationEngine = deps.optimizationEngine || createOptimizationEngine({
    // from learning
    promptLearning:   learningEngine.enabled ? learningEngine.promptLearning   : null,
    promptVersioning: learningEngine.enabled ? learningEngine.promptVersioning : null,
    creativeLearning: learningEngine.enabled ? learningEngine.creative         : null,
    policyLearning:   learningEngine.enabled ? learningEngine.policy           : null,
    modelEvaluation:  learningEngine.enabled ? learningEngine.modelEval        : null,
    trendDetection:   learningEngine.enabled ? learningEngine.trends           : null,
    qualityLearning:  learningEngine.enabled ? learningEngine.quality          : null,
    abLearning:       learningEngine.enabled ? learningEngine.ab               : null,
    audienceLearning: learningEngine.enabled ? learningEngine.audience         : null,
    // from analytics
    kpiCalculator:  analyticsEngine.enabled ? analyticsEngine.kpi        : null,
    publishHistory: deps.publishHistory || null,
  });

  const acp = createAcpValidator();

  // Automation engine – reuses Pipeline, Publish, Optimization, and event bus
  const automationEngine = deps.automationEngine || createAutomationEngine({
    publishEngine:  pipeline.publishEngine || null,
    pipeline:       pipeline               || null,
    bullQueue:      deps.bullQueue         || null,
  });
  // Forward ACP events to automation engine as well
  if (automationEngine.enabled) {
    events._automationEngine = automationEngine;
  }

  // Extend the events.emit wrapper to also forward to automation engine
  if (automationEngine.enabled && analyticsEngine.enabled) {
    const _emitWithAutomation = events.emit.bind(events);
    events.emit = async function (params) {
      const result = await _emitWithAutomation(params);
      if (events._automationEngine) {
        events._automationEngine.consumeEvent(result?.envelope).catch(() => {});
      }
      return result;
    };
  }

  // Revenue Growth Engine – no direct Kernel access, DI only
  const revenueEngine = deps.revenueEngine || createRevenueGrowthEngine({
    kpiCalculator: analyticsEngine.enabled ? analyticsEngine.kpi : null,
  });

  const runtimeRef = {
    store,
    events,
    registry,
    skillGraph,
    capabilityDiscovery,
    planner,
    policyEngine,
    promptCompiler,
    governance,
    approvalGate,
    observability,
    contextManager,
    checkpointManager,
    executionGraph,
    pipeline,
    executionRuntime,
    taskRuntime,
    costDashboard,
    creativeRuntime,
    learningEngine,
    optimizationEngine,
    automationEngine,
    billingEngine,
    revenueEngine,
    marketplace,
    acp,
    analyticsEngine,
  };

  const skills = deps.skillEngine || createSkillEngine({
    runtime:         runtimeRef,
    store,
    registry,
    marketplace,
    billingEngine,
    governance,
    pipeline,
    events,
  });

  const orchestrator = deps.orchestratorEngine || createOrchestratorEngine({
    runtime:           { ...runtimeRef, skills },
    store,
    skills,
    pipeline,
    checkpointManager,
    observability,
    governance,
    policyEngine,
    automation:        automationEngine,
    analyticsEngine,
    billingEngine,
    events,
  });

  const knowledge = deps.knowledgeEngine || createKnowledgeEngine({
    runtime:           { ...runtimeRef, skills, orchestrator },
    store,
    governance,
    skills,
    marketplace,
    analyticsEngine,
    learningEngine,
    events,
  });

  const workflows = deps.workflowEngine || createWorkflowEngine({
    runtime:           { ...runtimeRef, skills, orchestrator, knowledge },
    store,
    planner,
    pipeline,
    skills,
    knowledge,
    marketplace,
    orchestrator,
    checkpointManager,
    governance,
    billingEngine,
    observability,
    analyticsEngine,
    events,
  });

  const applications = deps.applicationEngine || createApplicationEngine({
    runtime:     { ...runtimeRef, skills, orchestrator, knowledge, workflows },
    store,
    skills,
    workflows,
    knowledge,
    marketplace,
    billingEngine,
    governance,
    events,
    revenueEngine,
    growthEngine: deps.growthEngine,
  });

  const tenants = deps.tenantEngine || createTenantEngine({
    runtime: { ...runtimeRef, skills, orchestrator, knowledge, workflows, applications },
    store,
    applications,
    billingEngine,
    governance,
    revenueEngine,
  });

  const integrations = deps.integrationEngine || createIntegrationEngine({
    runtime: { ...runtimeRef, skills, orchestrator, knowledge, workflows, applications, tenants },
    store,
    marketplace,
    workflows,
    applications,
    knowledge,
    skills,
    billingEngine,
    governance,
    tenants,
    automation: automationEngine,
    analyticsEngine,
    revenueEngine,
    events,
  });

  const growth = deps.growthPlatform || createGrowthEngine({
    runtime: {
      ...runtimeRef,
      skills,
      orchestrator,
      knowledge,
      workflows,
      applications,
      tenants,
      integrations,
    },
    store,
    events,
    governance,
    tenants,
    applications,
    workflows,
    integrations,
    orchestrator,
    creditProvider: deps.growthEngine,
    revenueEngine,
    analyticsEngine,
  });

  return {
    ...runtimeRef,
    skills,
    orchestrator,
    knowledge,
    workflows,
    applications,
    tenants,
    integrations,
    growth,
  };
}

export {
  createRuntimeStore,
  createMemoryRuntimeStore,
  createPgRuntimeStore,
} from './runtimeStore.js';
