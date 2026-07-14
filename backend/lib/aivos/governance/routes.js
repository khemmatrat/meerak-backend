export function registerGovernanceRoutes(app, { governance, authenticateToken, governanceEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!governanceEnabled || !governance?.enabled) {
    app.use('/api/aivos/governance', (_req, res) => {
      res.status(503).json({ error: 'aivos_governance_disabled', hint: 'Set AIVOS_GOVERNANCE_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/governance/jobs/:id/audit', auth, (req, res) => {
    const audit = governance.listAudit({ jobId: req.params.id });
    res.json({ ok: true, jobId: req.params.id, audit });
  });

  app.get('/api/aivos/governance/jobs/:id/reproduce', auth, async (req, res) => {
    try {
      const result = await governance.reproduce(req.params.id);
      if (!result) return res.status(404).json({ error: 'job_not_found' });
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/aivos/governance/pins/:entityType/:entityId', auth, (req, res) => {
    const pin = governance.getPin({ entityType: req.params.entityType, entityId: req.params.entityId });
    res.json({ ok: true, pin });
  });

  return { enabled: true };
}
