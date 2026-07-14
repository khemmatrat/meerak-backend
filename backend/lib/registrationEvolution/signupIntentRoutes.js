/**
 * V2 signup intent HTTP surface — gated by ENABLE_SIGNUP_INTENTS (404 when off).
 * Mounted under /api; relies on global apiLimiter. No coupling to V1 register.
 * Phase 2.5: adds /api/signup-intents/metrics (ENABLE_INTENT_METRICS gated).
 */

import { signupIntentHttpCreate, signupIntentHttpStatus } from './signupIntentService.js';
import { getRegistrationEvolutionFeatureFlags } from './featureFlags.js';
import { getIntentMetricsSnapshot, getIntentMetricsFromDb, getIntentEventMetricsFromDb } from './signupIntentMetrics.js';

/**
 * @param {import('express').Express} app
 * @param {{ pool: import('pg').Pool }} deps
 */
export function mountSignupIntentRoutes(app, { pool }) {
  app.post('/api/signup-intents', async (req, res) => {
    try {
      const out = await signupIntentHttpCreate(pool, req);
      return res.status(out.status).json(out.body);
    } catch (e) {
      console.error('[POST /api/signup-intents]', e?.message || e);
      return res.status(500).json({ error: 'Failed to create signup intent' });
    }
  });

  app.get('/api/signup-intents/:id/status', async (req, res) => {
    try {
      const out = await signupIntentHttpStatus(pool, req);
      return res.status(out.status).json(out.body);
    } catch (e) {
      console.error('[GET /api/signup-intents/:id/status]', e?.message || e);
      return res.status(500).json({ error: 'Failed to load signup intent status' });
    }
  });

  app.get('/api/signup-intents/metrics', async (req, res) => {
    const flags = getRegistrationEvolutionFeatureFlags();
    if (!flags.ENABLE_SIGNUP_INTENTS || !flags.ENABLE_INTENT_METRICS) {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const [inProcess, dbCounts, eventCounts] = await Promise.all([
        getIntentMetricsSnapshot(),
        getIntentMetricsFromDb(pool),
        getIntentEventMetricsFromDb(pool),
      ]);
      return res.json({ in_process: inProcess, db: dbCounts, events: eventCounts });
    } catch (e) {
      console.error('[GET /api/signup-intents/metrics]', e?.message || e);
      return res.status(500).json({ error: 'Metrics unavailable' });
    }
  });
}
