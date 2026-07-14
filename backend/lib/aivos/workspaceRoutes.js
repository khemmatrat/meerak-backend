import { isResumePluginEnabled } from './config.js';
import { getAivosRuntime } from './index.js';

export function registerWorkspaceRoutes(app, deps = {}) {
  const { authenticateToken } = deps;
  const enabled = deps.workspaceEnabled ?? (process.env.AIVOS_WORKSPACE_ENABLED === '1' || process.env.AIVOS_WORKSPACE_ENABLED === 'true');
  const runtimeEnabled = deps.runtimeEnabled ?? (process.env.AIVOS_RUNTIME_ENABLED === '1' || process.env.AIVOS_RUNTIME_ENABLED === 'true');

  function noopAuth(req, _res, next) {
    req.user = req.user || null;
    next();
  }

  app.get('/api/aivos/workspace/health', (_req, res) => {
    res.json({ ok: true, workspaceEnabled: enabled, runtimeEnabled });
  });

  if (!enabled || !runtimeEnabled) {
    app.use('/api/aivos/workspace', (_req, res) => {
      res.status(503).json({ error: 'aivos_workspace_disabled', hint: 'Set AIVOS_WORKSPACE_ENABLED=1 and AIVOS_RUNTIME_ENABLED=1' });
    });
    return { enabled: false };
  }

  const runtime = getAivosRuntime({ pool: deps.pool, syncExecute: deps.syncExecute !== false, enqueueJob: deps.enqueueJob, forceResumePlugin: isResumePluginEnabled() });
  const auth = authenticateToken || noopAuth;

  async function choosePluginByCapability(capability) {
    const plugins = runtime.registry.listPlugins ? await runtime.registry.listPlugins() : [];
    return plugins.find((p) => (p.capabilities || []).includes(capability))?.plugin_id || null;
  }

  app.get('/api/aivos/workspace/plugins', auth, async (_req, res) => {
    const plugins = runtime.registry.listPlugins ? await runtime.registry.listPlugins() : [];
    res.json({ ok: true, plugins });
  });

  app.get('/api/aivos/workspace/jobs/history', auth, async (_req, res) => {
    const jobs = runtime.store._tables?.jobs ? [...runtime.store._tables.jobs.values()] : [];
    res.json({ ok: true, jobs });
  });

  app.post('/api/aivos/workspace/jobs', auth, async (req, res) => {
    try {
      const { capability, pluginId: explicitPluginId, intent, draft } = req.body || {};
      if (!intent || typeof intent !== 'object') return res.status(400).json({ error: 'intent_required' });
      let pluginId = explicitPluginId;
      if (!pluginId && capability) {
        pluginId = await choosePluginByCapability(capability);
      }
      if (!pluginId) return res.status(404).json({ error: 'plugin_not_found_for_capability' });

      let job;
      if (draft) {
        job = await runtime.store.insertJob({
          plugin_id: pluginId,
          status: 'draft',
          approval_state: 'draft',
          intent,
          trace_id: intent.traceId || null,
        });
      } else {
        job = await runtime.taskRuntime.submitJob({ pluginId, intent, options: { traceId: intent.traceId } });
      }
      res.status(draft ? 201 : 200).json({ ok: true, job });
    } catch (e) {
      const status = e.code === 'PLUGIN_NOT_FOUND' ? 404 : 500;
      res.status(status).json({ error: e.code || e.message || 'workspace_error' });
    }
  });

  app.get('/api/aivos/workspace/jobs/:id', auth, async (req, res) => {
    const job = await runtime.taskRuntime.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job_not_found' });
    res.json({ ok: true, job });
  });

  app.get('/api/aivos/workspace/jobs/:id/events', auth, async (req, res) => {
    const events = await runtime.events.listByJob(req.params.id);
    res.json({ ok: true, events });
  });

  app.get('/api/aivos/workspace/jobs/:id/events/stream', auth, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const events = await runtime.events.listByJob(req.params.id);
    for (const ev of events) {
      res.write(`event: ${ev.name || 'message'}\n`);
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    res.write('event: end\n');
    res.write('data: {}\n\n');
    res.end();
  });

  app.post('/api/aivos/workspace/jobs/:id/resume', auth, async (req, res) => {
    try {
      const jobId = req.params.id;
      const plan = await runtime.store.getPlanByJobId(jobId);
      if (!plan) return res.status(404).json({ error: 'plan_not_found' });
      const resumed = await runtime.pipeline.executor.resumeFromLastCheckpoint({ runtimeJobId: jobId, plan, traceId: (req.body || {}).traceId });
      res.json({ ok: true, resumed });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'resume_error' });
    }
  });

  return { enabled: true, runtime };
}
