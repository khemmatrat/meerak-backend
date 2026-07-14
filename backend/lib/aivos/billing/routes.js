export function registerBillingRoutes(app, { billing, authenticateToken, billingEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!billingEnabled || !billing?.enabled) {
    app.use('/api/aivos/billing', (_req, res) => {
      res.status(503).json({ error: 'aivos_billing_disabled', hint: 'Set AIVOS_BILLING_ENABLED=1' });
    });
    return { enabled: false };
  }

  app.get('/api/aivos/billing/status', auth, async (req, res) => {
    try {
      const userId = req.user?.id || req.query.userId;
      if (!userId) return res.status(400).json({ error: 'userId_required' });
      const status = await billing.getStatus(userId);
      res.json({ ok: true, ...status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/aivos/billing/jobs/:id/usage', auth, async (req, res) => {
    try {
      const usage = billing.getJobUsage(req.params.id);
      res.json({ ok: true, jobId: req.params.id, ...usage });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return { enabled: true };
}
