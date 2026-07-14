import { AIVOS_RUNTIME_ENABLED } from './config.js';
import { createRuntime } from './runtime/index.js';
import { createAivosSdk } from './sdk/index.js';
import { createProductionModule, generateOpenApiSpec, getProductionChecklist, PRODUCTION_PHASE } from './production/index.js';
import { registerMarketplaceRoutes } from './marketplace/routes.js';
import { isMarketplaceEnabled } from './marketplace/config.js';
import { registerBillingRoutes } from './billing/routes.js';
import { isBillingEnabled } from './billing/config.js';
import { registerGovernanceRoutes } from './governance/routes.js';
import { isGovernanceEnabled } from './governance/config.js';
import { registerQaRoutes } from './qa/routes.js';
import { createQaEngine, isQaEnabled } from './qa/index.js';
import { registerSkillRoutes } from './skill/routes.js';
import { isSkillEnabled } from './skill/index.js';
import { registerOrchestratorRoutes } from './orchestrator/routes.js';
import { isOrchestratorEnabled } from './orchestrator/index.js';
import { registerKnowledgeRoutes } from './knowledge/routes.js';
import { isKnowledgeEnabled } from './knowledge/index.js';
import { registerWorkflowRoutes } from './workflow/routes.js';
import { isWorkflowEnabled } from './workflow/index.js';
import { registerApplicationRoutes } from './application/routes.js';
import { isApplicationEnabled } from './application/index.js';
import { registerTenantRoutes } from './tenant/routes.js';
import { isTenantEnabled } from './tenant/index.js';
import { registerIntegrationRoutes } from './integration/routes.js';
import { isIntegrationEnabled } from './integration/index.js';
import { registerGrowthRoutes } from './growth/routes.js';
import { isGrowthEnabled } from './growth/index.js';
import { registerMerchantAdRoutes } from './merchant-ad/routes.js';
import { createMerchantAdEngine, isMerchantAdEnabled } from './merchant-ad/index.js';

let cachedRuntime = null;

export function getAivosRuntime(deps = {}) {
  if (!cachedRuntime || deps.forceNew) {
    cachedRuntime = createRuntime(deps);
  }
  return cachedRuntime;
}

export function registerAivosRoutes(app, deps = {}) {
  const { pool, authenticateToken } = deps;
  const runtimeEnabled = deps.runtimeEnabled ?? AIVOS_RUNTIME_ENABLED;

  app.get('/api/aivos/runtime/health', (_req, res) => {
    res.json({
      ok: true,
      status: runtimeEnabled ? 'READY' : 'DISABLED',
      enabled: runtimeEnabled,
      phase: PRODUCTION_PHASE,
    });
  });

  app.get('/api/aivos/production/openapi.json', (_req, res) => {
    res.json(generateOpenApiSpec());
  });

  app.get('/api/aivos/production/checklist', (_req, res) => {
    res.json({ ok: true, ...getProductionChecklist({ runtimeEnabled }) });
  });

  if (!runtimeEnabled) {
    app.get('/api/aivos/production/readiness', (_req, res) => {
      res.status(503).json({ ok: false, error: 'aivos_runtime_disabled' });
    });
    app.use('/api/aivos/runtime', (_req, res) => {
      res.status(503).json({ error: 'aivos_runtime_disabled', hint: 'Set AIVOS_RUNTIME_ENABLED=1' });
    });
    registerMarketplaceRoutes(app, { marketplaceEnabled: false, authenticateToken });
    registerBillingRoutes(app, { billingEnabled: false, authenticateToken });
    registerGovernanceRoutes(app, { governanceEnabled: false, authenticateToken });
    registerQaRoutes(app, { qaEnabled: false, authenticateToken });
    registerSkillRoutes(app, { skillEnabled: false, authenticateToken });
    registerOrchestratorRoutes(app, { orchestratorEnabled: false, authenticateToken });
    registerKnowledgeRoutes(app, { knowledgeEnabled: false, authenticateToken });
    registerWorkflowRoutes(app, { workflowEnabled: false, authenticateToken });
    registerApplicationRoutes(app, { applicationEnabled: false, authenticateToken });
    registerTenantRoutes(app, { tenantEnabled: false, authenticateToken });
    registerIntegrationRoutes(app, { integrationEnabled: false, authenticateToken });
    registerGrowthRoutes(app, { growthEnabled: false, authenticateToken });
    registerMerchantAdRoutes(app, { merchantAdEnabled: false, authenticateToken });
    return { enabled: false };
  }

  const runtime = getAivosRuntime({
    pool,
    syncExecute: deps.syncExecute !== false,
    enqueueJob: deps.enqueueJob,
    growthEngine: deps.growthEngine,
    forceNew: deps.forceNew,
  });
  const sdk = createAivosSdk({ runtime });
  const production = createProductionModule({ runtime });

  app.get('/api/aivos/production/readiness', (_req, res) => {
    const result = production.readiness.check();
    res.status(result.ok ? 200 : 503).json({ ok: result.ok, ...result });
  });

  app.post('/api/aivos/production/alerts/evaluate', authenticateToken || noopAuth, (req, res) => {
    const result = production.alerts.evaluate(req.body?.metrics || {});
    res.json({ ok: true, ...result });
  });

  app.post('/api/aivos/runtime/jobs', authenticateToken || noopAuth, async (req, res) => {
    try {
      const userId = req.user?.id || null;
      const { pluginId, intent, options } = req.body || {};
      if (!pluginId) return res.status(400).json({ error: 'pluginId_required' });
      if (!intent || typeof intent !== 'object') return res.status(400).json({ error: 'intent_required' });
      const job = await runtime.taskRuntime.submitJob({ userId, pluginId, intent, options });
      res.status(201).json({ ok: true, job });
    } catch (e) {
      const status = mapRuntimeErrorStatus(e);
      res.status(status).json({ error: e.code || e.message || 'runtime_error', details: e.details || null });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id', authenticateToken || noopAuth, async (req, res) => {
    try {
      const job = await runtime.taskRuntime.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'job_not_found' });
      res.json({ ok: true, job });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id/plan', authenticateToken || noopAuth, async (req, res) => {
    try {
      const plan = await runtime.store.getPlanByJobId(req.params.id);
      if (!plan) return res.status(404).json({ error: 'plan_not_found' });
      res.json({ ok: true, plan });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/aivos/runtime/jobs/:id/approve', authenticateToken || noopAuth, async (req, res) => {
    try {
      const approval = await runtime.taskRuntime.approve(req.params.id, req.user?.id);
      res.json({ ok: true, approval });
    } catch (e) {
      res.status(mapRuntimeErrorStatus(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/runtime/jobs/:id/reject', authenticateToken || noopAuth, async (req, res) => {
    try {
      const approval = await runtime.taskRuntime.reject(req.params.id, req.user?.id);
      res.json({ ok: true, approval });
    } catch (e) {
      res.status(mapRuntimeErrorStatus(e)).json({ error: e.code || e.message });
    }
  });

  app.post('/api/aivos/runtime/jobs/:id/reprompt', authenticateToken || noopAuth, async (req, res) => {
    try {
      const { intent } = req.body || {};
      if (!intent) return res.status(400).json({ error: 'intent_required' });
      const approval = await runtime.taskRuntime.reprompt(req.params.id, intent, req.user?.id);
      res.json({ ok: true, approval });
    } catch (e) {
      res.status(mapRuntimeErrorStatus(e)).json({ error: e.code || e.message });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id/events', authenticateToken || noopAuth, async (req, res) => {
    try {
      const events = await runtime.events.listByJob(req.params.id);
      res.json({ ok: true, events });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id/trace', authenticateToken || noopAuth, async (req, res) => {
    try {
      const spans = runtime.observability.getJobTrace(req.params.id);
      res.json({ ok: true, jobId: req.params.id, spans });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id/timeline', authenticateToken || noopAuth, async (req, res) => {
    try {
      const timeline = await runtime.observability.getTimeline(req.params.id);
      res.json({ ok: true, jobId: req.params.id, timeline });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/aivos/runtime/jobs/:id/cost', authenticateToken || noopAuth, async (req, res) => {
    try {
      const job = await runtime.store.getJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'job_not_found' });
      const userId = job.user_id || job.userId || null;
      const summary = await runtime.costDashboard.getSummary({ userId });
      res.json({ ok: true, jobId: req.params.id, ...summary });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  registerMarketplaceRoutes(app, {
    marketplace: runtime.marketplace,
    authenticateToken,
    marketplaceEnabled: deps.marketplaceEnabled ?? isMarketplaceEnabled(),
  });

  registerBillingRoutes(app, {
    billing: runtime.billingEngine,
    authenticateToken,
    billingEnabled: deps.billingEnabled ?? isBillingEnabled(),
  });

  registerGovernanceRoutes(app, {
    governance: runtime.governance,
    authenticateToken,
    governanceEnabled: deps.governanceEnabled ?? isGovernanceEnabled(),
  });

  const qa = createQaEngine({ runtime });
  registerQaRoutes(app, {
    qa,
    authenticateToken,
    qaEnabled: deps.qaEnabled ?? isQaEnabled(),
  });

  registerSkillRoutes(app, {
    skills: runtime.skills,
    authenticateToken,
    skillEnabled: deps.skillEnabled ?? isSkillEnabled(),
  });

  registerOrchestratorRoutes(app, {
    orchestrator: runtime.orchestrator,
    authenticateToken,
    orchestratorEnabled: deps.orchestratorEnabled ?? isOrchestratorEnabled(),
  });

  registerKnowledgeRoutes(app, {
    knowledge: runtime.knowledge,
    authenticateToken,
    knowledgeEnabled: deps.knowledgeEnabled ?? isKnowledgeEnabled(),
  });

  registerWorkflowRoutes(app, {
    workflows: runtime.workflows,
    authenticateToken,
    workflowEnabled: deps.workflowEnabled ?? isWorkflowEnabled(),
  });

  registerApplicationRoutes(app, {
    applications: runtime.applications,
    authenticateToken,
    applicationEnabled: deps.applicationEnabled ?? isApplicationEnabled(),
  });

  registerTenantRoutes(app, {
    tenants: runtime.tenants,
    authenticateToken,
    tenantEnabled: deps.tenantEnabled ?? isTenantEnabled(),
  });

  registerIntegrationRoutes(app, {
    integrations: runtime.integrations,
    authenticateToken,
    integrationEnabled: deps.integrationEnabled ?? isIntegrationEnabled(),
  });

  registerGrowthRoutes(app, {
    growth: runtime.growth,
    authenticateToken,
    growthEnabled: deps.growthEnabled ?? isGrowthEnabled(),
  });

  const merchantAd = deps.merchantAdEngine || createMerchantAdEngine();
  registerMerchantAdRoutes(app, {
    merchantAd,
    authenticateToken,
    merchantAdEnabled: deps.merchantAdEnabled ?? isMerchantAdEnabled(),
  });

  return { enabled: true, runtime, sdk, production, qa, merchantAd };
}

function noopAuth(req, _res, next) {
  req.user = req.user || null;
  next();
}

function mapRuntimeErrorStatus(err) {
  const code = err?.code || '';
  if (code === 'RAW_PROMPT_REJECTED' || code === 'POLICY_REJECTED' || code === 'INTENT_SLOT_MISSING') return 400;
  if (code === 'PLUGIN_NOT_FOUND' || code === 'PROMPT_NOT_FOUND') return 404;
  if (code === 'CAPABILITY_GAP' || code === 'SKILL_GRAPH_ERROR') return 422;
  if (code === 'INSUFFICIENT_CREDITS' || code === 'ENTITLEMENT_TIER_INSUFFICIENT') return 402;
  if (code === 'APPROVAL_INVALID_TRANSITION') return 409;
  return 500;
}

export { createRuntime } from './runtime/index.js';
export { createAivosSdk } from './sdk/index.js';
export { AIVOS_RUNTIME_ENABLED } from './config.js';
export { createProductionModule, generateOpenApiSpec, getProductionChecklist, PRODUCTION_PHASE } from './production/index.js';
export { isMarketplaceEnabled } from './marketplace/config.js';
export { createMarketplaceEngine } from './marketplace/index.js';
export { isBillingEnabled } from './billing/config.js';
export { createBillingEngine } from './billing/index.js';
export { isGovernanceEnabled } from './governance/config.js';
export { createGovernanceEngine } from './governance/index.js';
export { createQaEngine, isQaEnabled, QA_PHASE } from './qa/index.js';
export { createSkillEngine, isSkillEnabled, SKILL_PHASE } from './skill/index.js';
export { createOrchestratorEngine, isOrchestratorEnabled, ORCHESTRATOR_PHASE } from './orchestrator/index.js';
export { createKnowledgeEngine, isKnowledgeEnabled, KNOWLEDGE_PHASE } from './knowledge/index.js';
export { createWorkflowEngine, isWorkflowEnabled, WORKFLOW_PHASE } from './workflow/index.js';
export { createApplicationEngine, isApplicationEnabled, APPLICATION_PHASE } from './application/index.js';
export { createTenantEngine, isTenantEnabled, TENANT_PHASE } from './tenant/index.js';
export { createIntegrationEngine, isIntegrationEnabled, INTEGRATION_PHASE } from './integration/index.js';
export { createGrowthEngine, isGrowthEnabled, GROWTH_PHASE } from './growth/index.js';
