export function registerSkillRoutes(app, { skills, authenticateToken, skillEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!skillEnabled || !skills?.enabled) {
    app.use('/api/aivos/skills', (_req, res) => {
      res.status(503).json({ error: 'aivos_skill_disabled', hint: 'Set AIVOS_SKILL_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/skills/list', auth, (_req, res) => {
    res.json({ ok: true, skills: skills.registry.listSkills(), templates: skills.templates() });
  });

  app.get('/api/aivos/skills/capabilities', auth, (req, res) => {
    const capability = req.query.capability;
    if (capability) {
      res.json({ ok: true, ...skills.capability.lookup(capability) });
      return;
    }
    res.json({ ok: true, capabilities: skills.capability.listCapabilities() });
  });

  app.post('/api/aivos/skills/install', auth, async (req, res) => {
    try {
      const manifest = req.body?.manifest || req.body;
      const validation = skills.validate(manifest);
      if (!validation.ok) {
        return res.status(400).json({ ok: false, errors: validation.errors });
      }
      const result = await skills.install(validation.manifest, { userId: req.user?.id });
      res.status(201).json({ ok: true, skill: result });
    } catch (e) {
      res.status(mapSkillError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/skills/enable', auth, async (req, res) => {
    try {
      const { skillId } = req.body || {};
      if (!skillId) return res.status(400).json({ error: 'skillId_required' });
      const result = await skills.enable(skillId);
      res.json({ ok: true, skill: result });
    } catch (e) {
      res.status(mapSkillError(e)).json({ error: e.code || e.message, details: e.details || null });
    }
  });

  app.post('/api/aivos/skills/disable', auth, async (req, res) => {
    try {
      const { skillId } = req.body || {};
      if (!skillId) return res.status(400).json({ error: 'skillId_required' });
      const result = await skills.disable(skillId);
      res.json({ ok: true, skill: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/aivos/skills/reload', auth, async (req, res) => {
    try {
      const { skillId } = req.body || {};
      if (!skillId) return res.status(400).json({ error: 'skillId_required' });
      const row = skills.registry.findSkill(skillId);
      if (!row) return res.status(404).json({ error: 'skill_not_found' });
      const result = await skills.reloadSkill(row);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/aivos/skills/validate', auth, (req, res) => {
    const manifest = req.body?.manifest || req.body;
    const validation = skills.validate(manifest);
    res.json({ ok: validation.ok, ...validation });
  });

  return { enabled: true };
}

function mapSkillError(err) {
  const code = err?.code || '';
  if (code === 'SKILL_DEPENDENCY_GAP') return 422;
  if (code === 'SKILL_NOT_FOUND') return 404;
  return 500;
}
