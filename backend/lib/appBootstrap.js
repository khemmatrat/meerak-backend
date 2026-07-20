/**
 * GET /api/app/bootstrap — mobile cold-start payload (IRP-1-02).
 * Extends /api/app/config with stable fallback fields when subsystems are unavailable.
 */

export function bootstrapEnvelope(config, updatedAt, fetchedAt = new Date().toISOString()) {
  return {
    config,
    updatedAt,
    paymentProvider: null,
    transportPricing: null,
    promoFund: { balance_thb: 0, visible: false, updated_at: null },
    complianceVersions: { terms: null, privacy: null },
    communityChallenge: { enabled: false },
    fetchedAt,
  };
}

/** @param {import('express').Express} app */
export function registerAppBootstrapRoute(app, deps) {
  const { pool, normalizeStoredMobileAppConfig, augmentMobileConfigForPublicClients } = deps;

  app.get('/api/app/bootstrap', async (req, res) => {
    try {
      const r = await pool
        .query(`SELECT value, updated_at FROM system_settings WHERE key = 'mobile_app_config'`)
        .catch(() => ({ rows: [] }));
      const raw = r?.rows?.[0]?.value;
      let parsed = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = {};
        }
      }
      let config = normalizeStoredMobileAppConfig(parsed);
      config = await augmentMobileConfigForPublicClients(config);
      const updatedAt = r?.rows?.[0]?.updated_at
        ? new Date(r.rows[0].updated_at).toISOString()
        : null;
      res.json(bootstrapEnvelope(config, updatedAt));
    } catch (e) {
      console.error('GET /api/app/bootstrap:', e?.message || e);
      let cfg = normalizeStoredMobileAppConfig({});
      try {
        cfg = await augmentMobileConfigForPublicClients(cfg);
      } catch (_) {
        /* ignore */
      }
      res.json(bootstrapEnvelope(cfg, null));
    }
  });
}
