import { isWorkflowEnabled, WORKFLOW_PHASE } from './config.js';
import { createWorkflowRegistry } from './workflowRegistry.js';
import { validateManifest } from './workflowValidator.js';
import { createWorkflowLibrary } from './workflowLibrary.js';
import { createWorkflowComposer } from './workflowComposer.js';
import { createWorkflowCompiler } from './workflowCompiler.js';
import { createWorkflowResolver } from './workflowResolver.js';
import { createWorkflowVariables } from './workflowVariables.js';
import { createWorkflowExecutor } from './workflowExecutor.js';
import { createWorkflowVersioning } from './workflowVersioning.js';
import { createWorkflowMetrics } from './workflowMetrics.js';
import { createWorkflowAudit } from './workflowAudit.js';
import { BUILTIN_WORKFLOW_TEMPLATES, getWorkflowTemplate } from './workflowTemplate.js';
import { normalizeManifest, MANIFEST_FIELDS } from './workflowManifest.js';

function disabledStub() {
  return {
    enabled: false,
    phase: WORKFLOW_PHASE,
    registry: { listWorkflows: () => [], findWorkflow: () => null },
    validate: () => ({ ok: false, reason: 'workflow_disabled' }),
    compile:  async () => null,
    execute:  async () => ({ ok: false }),
    getMetrics: () => ({ executionCount: 0 }),
  };
}

export function createWorkflowEngine({
  runtime,
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
} = {}) {
  if (!isWorkflowEnabled()) return disabledStub();

  const resolvedStore = store || runtime?.store;
  const registry = createWorkflowRegistry({ store: resolvedStore });
  const library = createWorkflowLibrary({ registry });
  const composer = createWorkflowComposer({ pipeline: pipeline || runtime?.pipeline });
  const compiler = createWorkflowCompiler({
    planner: planner || runtime?.planner,
    pipeline: pipeline || runtime?.pipeline,
  });
  const resolver = createWorkflowResolver({
    store: resolvedStore,
    skills: skills || runtime?.skills,
    knowledge: knowledge || runtime?.knowledge,
    marketplace: marketplace || runtime?.marketplace,
    pipeline: pipeline || runtime?.pipeline,
    billingEngine: billingEngine || runtime?.billingEngine,
    governance: governance || runtime?.governance,
  });
  const variables = createWorkflowVariables();
  const metrics = createWorkflowMetrics();
  const versioning = createWorkflowVersioning({ store: resolvedStore, governance: governance || runtime?.governance });
  const audit = createWorkflowAudit({ governance: governance || runtime?.governance, store: resolvedStore });
  const executor = createWorkflowExecutor({
    store: resolvedStore,
    compiler,
    resolver,
    variables,
    orchestrator: orchestrator || runtime?.orchestrator,
    checkpointManager: checkpointManager || runtime?.checkpointManager,
    metrics,
    audit,
    versioning,
    billingEngine: billingEngine || runtime?.billingEngine,
    observability: observability || runtime?.observability,
    events: events || runtime?.events,
    registry,
    skills: skills || runtime?.skills,
  });

  const engine = {
    enabled: true,
    phase:   WORKFLOW_PHASE,
    registry,
    library,
    composer,
    compiler,
    resolver,
    variables,
    executor,
    versioning,
    metrics,
    audit,

    validate: (raw) => validateManifest(raw),
    register: (manifest) => {
      const v = validateManifest(manifest);
      if (!v.ok) {
        const err = new Error('workflow_manifest_invalid');
        err.code = 'WORKFLOW_MANIFEST_INVALID';
        err.details = v.errors;
        throw err;
      }
      audit.recordRevision({ workflowId: v.manifest.id, action: 'register' });
      return registry.registerWorkflow(v.manifest);
    },
    compile: (manifest, opts) => compiler.compile(manifest, opts),
    execute: (opts) => executor.execute(opts),
    resume:  (id) => executor.resume(id),
    rollback(workflowId) {
      const target = versioning.rollback(workflowId);
      const existing = registry.findWorkflow(workflowId);
      if (existing) {
        registry.updateWorkflow(workflowId, {
          manifest: target.manifest,
          version:  target.version,
        });
      } else {
        registry.registerWorkflow(target.manifest);
      }
      audit.recordRevision({ workflowId, action: 'rollback', diff: { version: target.version } });
      return target;
    },
    getMetrics: (opts) => metrics.getMetrics(opts),
    listTemplates: () => library.list(),
    getTemplate: (id) => getWorkflowTemplate(id),
  };

  if (runtime) runtime.workflows = engine;
  return engine;
}

export {
  isWorkflowEnabled,
  WORKFLOW_PHASE,
  validateManifest,
  normalizeManifest,
  MANIFEST_FIELDS,
  BUILTIN_WORKFLOW_TEMPLATES,
  createWorkflowRegistry,
  createWorkflowComposer,
  createWorkflowCompiler,
  createWorkflowVariables,
};
