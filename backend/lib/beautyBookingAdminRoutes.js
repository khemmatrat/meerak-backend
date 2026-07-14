import {
  listAdminBeautyBookings,
  getAdminBeautyBookingDetail,
  getBeautyPolicy,
  updateBeautyPolicy,
  listAdminBeautyDisputes,
  resolveBeautyDispute,
} from './beautyBookingService.js';

export function attachBeautyBookingAdminRoutes(app, deps) {
  const { pool, adminAuthMiddleware } = deps;

  app.get('/api/admin/beauty-bookings', adminAuthMiddleware, async (req, res) => {
    try {
      const bookings = await listAdminBeautyBookings(pool, {
        status: req.query.status,
        session_status: req.query.session_status,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json({ ok: true, bookings });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/beauty-bookings/policy', adminAuthMiddleware, async (_req, res) => {
    try {
      const policy = await getBeautyPolicy(pool);
      res.json({ ok: true, policy });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/admin/beauty-bookings/policy', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || req.user?.id || null;
      const policy = await updateBeautyPolicy(pool, req.body || {}, adminId);
      res.json({ ok: true, policy });
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/beauty-bookings/disputes/list', adminAuthMiddleware, async (req, res) => {
    try {
      const status = (req.query.status || 'open').toString();
      const disputes = await listAdminBeautyDisputes(pool, status);
      res.json({ ok: true, disputes });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/admin/beauty-bookings/disputes/:id/resolve', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || req.user?.id || null;
      const result = await resolveBeautyDispute(pool, adminId, req.params.id, req.body || {});
      res.json(result);
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/admin/beauty-bookings/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const detail = await getAdminBeautyBookingDetail(pool, req.params.id);
      res.json({ ok: true, ...detail });
    } catch (e) {
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });
}
