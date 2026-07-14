/**
 * Marketplace commission admin — proxy to storefront ledger aggregation.
 */
import {
  marketplaceCommissionAdminMiddleware,
} from './marketplaceCommissionAdminAuth.js';

const STOREFRONT_URL =
  process.env.STOREFRONT_URL || process.env.AQOND_STOREFRONT_URL || 'http://localhost:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

async function proxyMarketplaceCommission(path, query = '') {
  const url = `${STOREFRONT_URL.replace(/\/$/, '')}/api/admin/marketplace/commission${path}${query}`;
  const res = await fetch(url, {
    headers: { 'x-admin-key': ADMIN_KEY },
    signal: AbortSignal.timeout(12_000),
  });
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    return { status: res.status, csv: await res.text() };
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export function attachMarketplaceCommissionAdminRoutes(app, deps) {
  const { adminAuthMiddleware } = deps;
  const guard = marketplaceCommissionAdminMiddleware(adminAuthMiddleware);

  app.get('/api/admin/marketplace/commission/summary', guard, async (req, res) => {
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const { status, body, csv } = await proxyMarketplaceCommission('/summary', qs);
      if (csv != null) return res.status(status).send(csv);
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/marketplace/commission/orders', guard, async (req, res) => {
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const { status, body } = await proxyMarketplaceCommission('/orders', qs);
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });

  app.get('/api/admin/marketplace/commission/export.csv', guard, async (req, res) => {
    try {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      const { status, csv, body } = await proxyMarketplaceCommission('/export.csv', qs);
      if (csv != null) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="marketplace-commission.csv"');
        return res.status(status).send(csv);
      }
      res.status(status).json(body);
    } catch (e) {
      res.status(502).json({ error: e?.message || 'storefront_unreachable' });
    }
  });
}
