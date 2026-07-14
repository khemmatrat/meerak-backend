import {
  resolveUserUuid,
  listProviderServices,
  createProviderService,
  updateProviderService,
  deleteProviderService,
  getOrCreateBookingSettings,
  patchBookingSettings,
  getBeautyProfile,
  getTransportQuote,
  createBeautyBooking,
  payBeautyBooking,
  saveWorkPhotos,
  submitBeautyCompletion,
  acceptBeautyCompletion,
  getBeautyPolicy,
  calcBeautyProviderPayout,
  createBeautyDispute,
} from './beautyBookingService.js';

function getUserIdFromReq(req) {
  return req.user?.id || null;
}

export function attachBeautyBookingRoutes(app, deps) {
  const { pool, authenticateToken, getBookingUserId } = deps;

  async function authUserId(req) {
    const raw = getBookingUserId ? getBookingUserId(req) : getUserIdFromReq(req);
    if (!raw) return null;
    return resolveUserUuid(pool, raw);
  }

  // ---- Provider: services CRUD ----
  app.get('/api/provider/services', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const services = await listProviderServices(pool, uid, false);
      res.json({ ok: true, services });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/provider/services', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const item = await createProviderService(pool, uid, req.body || {});
      res.status(201).json({ ok: true, item });
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/provider/services/:id', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const item = await updateProviderService(pool, uid, req.params.id, req.body || {});
      res.json({ ok: true, item });
    } catch (e) {
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.delete('/api/provider/services/:id', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      await deleteProviderService(pool, uid, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: 'not_found' });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  // ---- Provider: booking settings ----
  app.get('/api/provider/booking-settings', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const settings = await getOrCreateBookingSettings(pool, uid);
      res.json({
        ok: true,
        settings: {
          shop_name: settings.shop_name,
          shop_address: settings.shop_address,
          shop_lat: settings.shop_lat != null ? Number(settings.shop_lat) : null,
          shop_lng: settings.shop_lng != null ? Number(settings.shop_lng) : null,
          offers_at_shop: !!settings.offers_at_shop,
          offers_at_home: !!settings.offers_at_home,
          vehicle_type: settings.vehicle_type,
          vehicle_plate: settings.vehicle_plate,
          transport_rate_per_km: settings.transport_rate_per_km != null ? Number(settings.transport_rate_per_km) : null,
          payment_mode: settings.payment_mode,
          deposit_type: settings.deposit_type,
          deposit_value: Number(settings.deposit_value),
        },
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.patch('/api/provider/booking-settings', authenticateToken, async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const policy = await getBeautyPolicy(pool);
      const settings = await patchBookingSettings(pool, uid, req.body || {}, policy);
      res.json({ ok: true, settings });
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  // ---- Public beauty profile ----
  app.get('/api/providers/:id/beauty-profile', async (req, res) => {
    try {
      const providerUuid = await resolveUserUuid(pool, req.params.id);
      if (!providerUuid) return res.status(404).json({ error: 'not_found' });
      const profile = await getBeautyProfile(pool, providerUuid);
      const policy = await getBeautyPolicy(pool);
      res.json({
        ok: true,
        ...profile,
        policy: {
          transport_base_fare_thb: policy.transport_base_fare_thb,
          transport_rate_min_km: policy.transport_rate_min_km,
          transport_rate_max_km: policy.transport_rate_max_km,
          employer_service_fee_percent: policy.employer_service_fee_percent,
          employer_service_fee_by_tier: policy.employer_service_fee_by_tier || null,
          service_sourcing_percent: policy.service_sourcing_percent,
          service_commission_percent: policy.service_commission_percent,
          transport_platform_fee_percent: policy.transport_platform_fee_percent,
          service_sourcing_by_tier: policy.service_sourcing_by_tier || null,
          service_commission_by_tier: policy.service_commission_by_tier || null,
          transport_platform_fee_by_tier: policy.transport_platform_fee_by_tier || null,
        },
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/providers/:id/transport-quote', async (req, res) => {
    try {
      const providerUuid = await resolveUserUuid(pool, req.params.id);
      if (!providerUuid) return res.status(404).json({ error: 'not_found' });
      const lat = req.query.lat;
      const lng = req.query.lng;
      if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
      const quote = await getTransportQuote(pool, providerUuid, lat, lng);
      res.json({ ok: true, ...quote });
    } catch (e) {
      if (e?.code === 'NO_SHOP_LOCATION' || e?.code === 'NO_TRANSPORT_RATE') {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  // ---- Customer: create beauty booking ----
  app.post('/api/bookings/beauty', async (req, res) => {
    try {
      const bookerUuid = await authUserId(req);
      if (!bookerUuid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const booking = await createBeautyBooking(pool, bookerUuid, req.body || {});
      res.status(201).json({ success: true, booking });
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      if (e?.code === 'CONFLICT') return res.status(409).json({ error: e.message });
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      console.error('POST /api/bookings/beauty:', e);
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/bookings/:id/pay-beauty', async (req, res) => {
    try {
      const bookerUuid = await authUserId(req);
      if (!bookerUuid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const result = await payBeautyBooking(pool, bookerUuid, req.params.id, {
        isRemaining: !!req.body?.is_remaining,
      });
      res.json(result);
    } catch (e) {
      if (e?.code === 'INSUFFICIENT') return res.status(400).json({ error: e.message });
      if (e?.code === 'VALIDATION' || e?.code === 'FORBIDDEN') return res.status(400).json({ error: e.message });
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/bookings/:id/work-photos', authenticateToken, async (req, res) => {
    try {
      const talentUuid = await authUserId(req);
      if (!talentUuid) return res.status(401).json({ error: 'unauthorized' });
      const { phase, photo_urls } = req.body || {};
      const result = await saveWorkPhotos(pool, talentUuid, req.params.id, phase, photo_urls);
      res.json(result);
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/bookings/:id/submit-beauty-completion', authenticateToken, async (req, res) => {
    try {
      const talentUuid = await authUserId(req);
      if (!talentUuid) return res.status(401).json({ error: 'unauthorized' });
      const result = await submitBeautyCompletion(pool, talentUuid, req.params.id);
      res.json(result);
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/bookings/:id/accept-beauty-completion', async (req, res) => {
    try {
      const bookerUuid = await authUserId(req);
      if (!bookerUuid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const result = await acceptBeautyCompletion(pool, bookerUuid, req.params.id);
      res.json(result);
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.post('/api/bookings/:id/dispute-beauty', async (req, res) => {
    try {
      const bookerUuid = await authUserId(req);
      if (!bookerUuid) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      const result = await createBeautyDispute(pool, bookerUuid, req.params.id, req.body?.reason);
      res.json(result);
    } catch (e) {
      if (e?.code === 'VALIDATION') return res.status(400).json({ error: e.message });
      if (e?.code === 'NOT_FOUND') return res.status(404).json({ error: e.message });
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });

  app.get('/api/bookings/:id/beauty-detail', async (req, res) => {
    try {
      const uid = await authUserId(req);
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const r = await pool.query(
        `SELECT b.*, s.start_time, s.end_time FROM bookings b
         JOIN availability_slots s ON s.id = b.slot_id
         WHERE (b.id::text = $1 OR b.id = $1::uuid) AND b.booking_type = 'beauty' LIMIT 1`,
        [req.params.id],
      );
      if (!r.rows?.length) return res.status(404).json({ error: 'not_found' });
      const b = r.rows[0];
      if (String(b.booker_id) !== String(uid) && String(b.talent_id) !== String(uid)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const photos = await pool.query(
        `SELECT phase, photo_urls, submitted_at FROM booking_work_photos WHERE booking_id = $1`,
        [b.id],
      );
      const policy = await getBeautyPolicy(pool);
      const payout = calcBeautyProviderPayout(b.service_subtotal, b.transport_total || 0, policy);
      res.json({
        ok: true,
        booking: {
          id: String(b.id),
          status: b.status,
          session_status: b.session_status,
          location_mode: b.location_mode,
          service_subtotal: Number(b.service_subtotal),
          transport_total: Number(b.transport_total) || 0,
          quoted_price: Number(b.quoted_price),
          employer_service_fee: Number(b.employer_service_fee),
          employer_total: Number(b.employer_total),
          amount_paid: Number(b.amount_paid) || 0,
          remaining_balance: Number(b.remaining_balance) || 0,
          selected_items_json: b.selected_items_json,
          service_address_json: b.service_address_json,
          vehicle_type_snapshot: b.vehicle_type_snapshot,
          vehicle_plate_snapshot: b.vehicle_plate_snapshot,
          transport_distance_km: b.transport_distance_km != null ? Number(b.transport_distance_km) : null,
          withdrawable_at: b.withdrawable_at,
          start_time: r.rows[0].start_time,
          end_time: r.rows[0].end_time,
        },
        photos: (photos.rows || []).map((row) => {
          let urls = row.photo_urls;
          if (typeof urls === 'string') {
            try { urls = JSON.parse(urls); } catch { urls = []; }
          }
          return {
            phase: row.phase,
            photo_urls: Array.isArray(urls) ? urls : [],
            submitted_at: row.submitted_at,
          };
        }),
        provider_payout: payout,
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'server_error' });
    }
  });
}
