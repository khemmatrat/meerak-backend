/**
 * Food Merchant OS — admin API proxy to storefront aggregation layer.
 * Reuses storefront lib/server/foodMerchantOs.ts (no parallel service).
 */
const STOREFRONT_URL =
  process.env.STOREFRONT_URL || process.env.AQOND_STOREFRONT_URL || 'http://localhost:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

async function proxyFoodAdmin(path, query = '') {
  const url = `${STOREFRONT_URL.replace(/\/$/, '')}/api/admin/food${path}${query}`;
  const res = await fetch(url, {
    headers: { 'x-admin-key': ADMIN_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export function attachFoodMerchantAdminRoutes(app, deps) {
  const { adminAuthMiddleware } = deps;

  app.get('/api/admin/food/dashboard', adminAuthMiddleware, async (_req, res) => {
    try {
      const { status, body } = await proxyFoodAdmin('/dashboard');
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/food/orders', adminAuthMiddleware, async (req, res) => {
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const { status, body } = await proxyFoodAdmin('/orders', qs);
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/food/merchants', adminAuthMiddleware, async (_req, res) => {
    try {
      const { status, body } = await proxyFoodAdmin('/merchants');
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/food/riders', adminAuthMiddleware, async (_req, res) => {
    try {
      const { status, body } = await proxyFoodAdmin('/riders');
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/food/dispatch', adminAuthMiddleware, async (_req, res) => {
    try {
      const { status, body } = await proxyFoodAdmin('/dispatch');
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/food/orders/:orderId/timeline', adminAuthMiddleware, async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const { status, body } = await proxyFoodAdmin(`/orders/${encodeURIComponent(orderId)}/timeline`);
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/events', adminAuthMiddleware, async (req, res) => {
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const url = `${STOREFRONT_URL.replace(/\/$/, '')}/api/admin/events${qs}`;
      const res2 = await fetch(url, {
        headers: { 'x-admin-key': ADMIN_KEY },
        signal: AbortSignal.timeout(12_000),
      });
      const body = await res2.json().catch(() => ({}));
      res.status(res2.status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });
}
