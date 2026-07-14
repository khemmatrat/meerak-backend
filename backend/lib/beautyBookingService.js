import {
  round2,
  calcBeautyEmployerOutflow,
  calcBeautyProviderPayout,
  calcBeautyPaymentCharge,
} from './financialEngine.js';
import { calcBookingFees } from './bookingFeeEngine.js';
import { validateMerchantHubPolicyPatch } from './merchantHubFeePolicy.js';
import { bindAdClickFromBooking } from './adsOutcomeAttribution.js';

const DEFAULT_POLICY = {
  cancel_notice_hours: 3,
  no_show_fee_percent: 20,
  no_show_fee_platform_share: 30,
  no_show_fee_provider_share: 70,
  payout_withdraw_hold_hours: 24,
  min_completion_photos: 4,
  transport_base_fare_thb: 45,
  transport_rate_min_km: 8,
  transport_rate_max_km: 15,
  employer_service_fee_percent: 5,
  service_sourcing_percent: 8,
  service_commission_percent: 28,
  transport_platform_fee_percent: 3,
  use_vip_tier_overrides: false,
  employer_service_fee_by_tier: null,
  service_sourcing_by_tier: null,
  service_commission_by_tier: null,
  transport_platform_fee_by_tier: null,
};

export async function getBeautyPolicy(pool) {
  try {
    const r = await pool.query(
      `SELECT value_json FROM payout_config WHERE key = 'beauty_booking_policy' LIMIT 1`,
    );
    if (r.rows?.[0]?.value_json) {
      const raw = r.rows[0].value_json;
      const parsed = typeof raw === 'object' && raw !== null ? raw : JSON.parse(String(raw));
      return { ...DEFAULT_POLICY, ...parsed };
    }
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_POLICY };
}

export async function resolveUserUuid(pool, userId) {
  if (!userId) return null;
  const r = await pool.query(
    'SELECT id FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1',
    [String(userId)],
  );
  return r.rows?.[0]?.id || null;
}

/** Haversine distance in km */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return round2(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function computeTransportTotal(distanceKm, ratePerKm, baseFare = 45) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const rate = Math.max(0, Number(ratePerKm) || 0);
  const base = Math.max(0, Number(baseFare) || 45);
  return round2(base + km * rate);
}

export async function getOrCreateBookingSettings(pool, providerUserId) {
  const r = await pool.query(
    'SELECT * FROM provider_booking_settings WHERE provider_user_id = $1',
    [providerUserId],
  );
  if (r.rows?.length) return r.rows[0];
  const ins = await pool.query(
    `INSERT INTO provider_booking_settings (provider_user_id) VALUES ($1) RETURNING *`,
    [providerUserId],
  );
  return ins.rows[0];
}

function mapServiceItem(row) {
  return {
    id: String(row.id),
    item_type: row.item_type,
    title: row.title,
    description: row.description || null,
    price: Number(row.price),
    duration_minutes: Number(row.duration_minutes),
    category: row.category,
    is_active: !!row.is_active,
    sort_order: Number(row.sort_order) || 0,
  };
}

function mapSettings(row) {
  if (!row) return null;
  return {
    shop_name: row.shop_name || null,
    shop_address: row.shop_address || null,
    shop_lat: row.shop_lat != null ? Number(row.shop_lat) : null,
    shop_lng: row.shop_lng != null ? Number(row.shop_lng) : null,
    offers_at_shop: !!row.offers_at_shop,
    offers_at_home: !!row.offers_at_home,
    vehicle_type: row.vehicle_type || null,
    vehicle_plate: row.vehicle_plate || null,
    transport_rate_per_km:
      row.transport_rate_per_km != null ? Number(row.transport_rate_per_km) : null,
    payment_mode: row.payment_mode || 'both',
    deposit_type: row.deposit_type || 'percent',
    deposit_value: Number(row.deposit_value) || 30,
  };
}

export async function listProviderServices(pool, providerUserId, activeOnly = false) {
  const q = activeOnly
    ? `SELECT * FROM provider_service_items WHERE provider_user_id = $1 AND is_active = true ORDER BY sort_order, title`
    : `SELECT * FROM provider_service_items WHERE provider_user_id = $1 ORDER BY sort_order, title`;
  const r = await pool.query(q, [providerUserId]);
  return (r.rows || []).map(mapServiceItem);
}

export async function createProviderService(pool, providerUserId, body) {
  const title = String(body.title || '').trim();
  if (!title) throw Object.assign(new Error('title required'), { code: 'VALIDATION' });
  const price = Math.max(0, Number(body.price) || 0);
  const itemType = body.item_type === 'addon' ? 'addon' : 'main';
  const r = await pool.query(
    `INSERT INTO provider_service_items
       (provider_user_id, item_type, title, description, price, duration_minutes, category, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      providerUserId,
      itemType,
      title,
      body.description ? String(body.description).trim() : null,
      price,
      Math.max(15, Number(body.duration_minutes) || 30),
      String(body.category || 'other').slice(0, 30),
      Number(body.sort_order) || 0,
    ],
  );
  return mapServiceItem(r.rows[0]);
}

export async function updateProviderService(pool, providerUserId, serviceId, body) {
  const cur = await pool.query(
    `SELECT * FROM provider_service_items WHERE id = $1 AND provider_user_id = $2`,
    [serviceId, providerUserId],
  );
  if (!cur.rows?.length) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
  const row = cur.rows[0];
  const r = await pool.query(
    `UPDATE provider_service_items SET
       title = $1, description = $2, price = $3, duration_minutes = $4,
       category = $5, is_active = $6, sort_order = $7, item_type = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [
      body.title != null ? String(body.title).trim() : row.title,
      body.description !== undefined ? (body.description ? String(body.description).trim() : null) : row.description,
      body.price != null ? Math.max(0, Number(body.price)) : Number(row.price),
      body.duration_minutes != null ? Math.max(15, Number(body.duration_minutes)) : Number(row.duration_minutes),
      body.category != null ? String(body.category).slice(0, 30) : row.category,
      body.is_active !== undefined ? !!body.is_active : row.is_active,
      body.sort_order != null ? Number(body.sort_order) : Number(row.sort_order),
      body.item_type === 'addon' ? 'addon' : body.item_type === 'main' ? 'main' : row.item_type,
      serviceId,
    ],
  );
  return mapServiceItem(r.rows[0]);
}

export async function deleteProviderService(pool, providerUserId, serviceId) {
  const r = await pool.query(
    `DELETE FROM provider_service_items WHERE id = $1 AND provider_user_id = $2 RETURNING id`,
    [serviceId, providerUserId],
  );
  if (!r.rows?.length) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
  return { ok: true };
}

export async function patchBookingSettings(pool, providerUserId, body, policy) {
  await getOrCreateBookingSettings(pool, providerUserId);
  const p = policy || (await getBeautyPolicy(pool));
  const minRate = Number(p.transport_rate_min_km) || 8;
  const maxRate = Number(p.transport_rate_max_km) || 15;
  if (body.transport_rate_per_km != null && body.transport_rate_per_km !== '') {
    const rate = Number(body.transport_rate_per_km);
    if (!Number.isFinite(rate) || rate < minRate || rate > maxRate) {
      throw Object.assign(new Error(`อัตราต่อกม. ต้องอยู่ระหว่าง ${minRate}-${maxRate} บาท`), { code: 'VALIDATION' });
    }
  }
  const fields = [];
  const vals = [];
  let i = 1;
  const set = (col, val) => {
    fields.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (body.shop_name !== undefined) set('shop_name', body.shop_name ? String(body.shop_name).trim() : null);
  if (body.shop_address !== undefined) set('shop_address', body.shop_address ? String(body.shop_address).trim() : null);
  if (body.shop_lat !== undefined) set('shop_lat', body.shop_lat != null ? Number(body.shop_lat) : null);
  if (body.shop_lng !== undefined) set('shop_lng', body.shop_lng != null ? Number(body.shop_lng) : null);
  if (body.offers_at_shop !== undefined) set('offers_at_shop', !!body.offers_at_shop);
  if (body.offers_at_home !== undefined) set('offers_at_home', !!body.offers_at_home);
  if (body.vehicle_type !== undefined) set('vehicle_type', body.vehicle_type ? String(body.vehicle_type).trim() : null);
  if (body.vehicle_plate !== undefined) set('vehicle_plate', body.vehicle_plate ? String(body.vehicle_plate).trim() : null);
  if (body.transport_rate_per_km !== undefined) {
    set('transport_rate_per_km', body.transport_rate_per_km != null && body.transport_rate_per_km !== '' ? Number(body.transport_rate_per_km) : null);
  }
  if (body.payment_mode !== undefined) {
    const m = String(body.payment_mode);
    if (!['deposit', 'full_upfront', 'both'].includes(m)) throw Object.assign(new Error('payment_mode invalid'), { code: 'VALIDATION' });
    set('payment_mode', m);
  }
  if (body.deposit_type !== undefined) set('deposit_type', body.deposit_type === 'fixed' ? 'fixed' : 'percent');
  if (body.deposit_value !== undefined) set('deposit_value', Math.max(0, Number(body.deposit_value) || 0));
  if (!fields.length) return mapSettings(await getOrCreateBookingSettings(pool, providerUserId));
  fields.push('updated_at = NOW()');
  vals.push(providerUserId);
  const r = await pool.query(
    `UPDATE provider_booking_settings SET ${fields.join(', ')} WHERE provider_user_id = $${i} RETURNING *`,
    vals,
  );
  return mapSettings(r.rows[0]);
}

export async function getBeautyProfile(pool, providerUserId) {
  const settings = mapSettings(await getOrCreateBookingSettings(pool, providerUserId));
  const services = await listProviderServices(pool, providerUserId, true);
  const userRow = await pool.query(
    `SELECT expert_category, full_name FROM users WHERE id = $1 LIMIT 1`,
    [providerUserId],
  );
  const u = userRow.rows[0] || {};
  return {
    settings,
    services,
    expert_category: u.expert_category || null,
    provider_name: u.full_name || null,
  };
}

export async function getTransportQuote(pool, providerUserId, lat, lng) {
  const policy = await getBeautyPolicy(pool);
  const settings = await getOrCreateBookingSettings(pool, providerUserId);
  const shopLat = settings.shop_lat;
  const shopLng = settings.shop_lng;
  if (shopLat == null || shopLng == null) {
    throw Object.assign(new Error('ช่างยังไม่ได้ตั้งตำแหน่งร้าน'), { code: 'NO_SHOP_LOCATION' });
  }
  const rate = Number(settings.transport_rate_per_km);
  if (!Number.isFinite(rate)) {
    throw Object.assign(new Error('ช่างยังไม่ได้ตั้งอัตราค่าเดินทาง'), { code: 'NO_TRANSPORT_RATE' });
  }
  const distanceKm = haversineKm(shopLat, shopLng, Number(lat), Number(lng));
  const baseFare = Number(policy.transport_base_fare_thb) || 45;
  const transportTotal = computeTransportTotal(distanceKm, rate, baseFare);
  return {
    distance_km: distanceKm,
    transport_base_fare: baseFare,
    transport_rate_per_km: rate,
    transport_total: transportTotal,
    vehicle_type: settings.vehicle_type || null,
    vehicle_plate: settings.vehicle_plate || null,
    shop_lat: shopLat,
    shop_lng: shopLng,
  };
}

function calcDepositPrincipal(quotedPrice, settings, requestedMode) {
  let mode = requestedMode;
  if (settings.payment_mode === 'deposit') mode = 'deposit';
  if (settings.payment_mode === 'full_upfront') mode = 'full_upfront';
  if (mode !== 'deposit') return { mode: 'full_upfront', principal: quotedPrice };
  const q = Math.max(0, Number(quotedPrice) || 0);
  if (settings.deposit_type === 'fixed') {
    return { mode: 'deposit', principal: round2(Math.min(q, Number(settings.deposit_value) || 0)) };
  }
  const pct = Math.min(100, Math.max(0, Number(settings.deposit_value) || 30));
  return { mode: 'deposit', principal: round2(q * (pct / 100)) };
}

export async function createBeautyBooking(pool, bookerUuid, body) {
  const policy = await getBeautyPolicy(pool);
  const { slot_id, talent_id, location_mode, main_item_id, addon_item_ids, customer_lat, customer_lng, customer_address, payment_mode: reqPayMode } = body || {};
  if (body?.adClickPublicId) {
    await bindAdClickFromBooking(pool, {
      meerakUserId: bookerUuid,
      adClickPublicId: String(body.adClickPublicId),
      adCampaignId: body.adCampaignId || null,
      adCreativeId: body.adCreativeId || null,
      adImpressionId: body.adImpressionId || null,
      surface: body.adSurface || 'MARKETPLACE',
    }).catch((e) => console.warn('[ads] bind beauty booking click:', e?.message));
  }
  if (!slot_id || !talent_id || !location_mode) {
    throw Object.assign(new Error('slot_id, talent_id, location_mode required'), { code: 'VALIDATION' });
  }
  if (!['at_shop', 'at_home'].includes(location_mode)) {
    throw Object.assign(new Error('location_mode invalid'), { code: 'VALIDATION' });
  }
  const talentUuid = await resolveUserUuid(pool, talent_id);
  if (!talentUuid) throw Object.assign(new Error('ไม่พบช่าง'), { code: 'NOT_FOUND' });
  const settings = await getOrCreateBookingSettings(pool, talentUuid);
  if (location_mode === 'at_shop' && !settings.offers_at_shop) {
    throw Object.assign(new Error('ช่างไม่เปิดรับจองที่ร้าน'), { code: 'VALIDATION' });
  }
  if (location_mode === 'at_home' && !settings.offers_at_home) {
    throw Object.assign(new Error('ช่างไม่เปิดรับบริการนอกสถานที่'), { code: 'VALIDATION' });
  }
  const slotRow = await pool.query(
    'SELECT id, user_id, start_time, end_time FROM availability_slots WHERE id::text = $1 OR id = $1::uuid LIMIT 1',
    [slot_id],
  );
  if (!slotRow.rows?.length) throw Object.assign(new Error('ไม่พบช่วงเวลา'), { code: 'NOT_FOUND' });
  const slot = slotRow.rows[0];
  if (String(slot.user_id) !== String(talentUuid)) {
    throw Object.assign(new Error('slot ไม่ตรงกับช่าง'), { code: 'VALIDATION' });
  }
  const existing = await pool.query(
    "SELECT id FROM bookings WHERE slot_id = $1 AND status IN ('pending', 'confirmed') LIMIT 1",
    [slot.id],
  );
  if (existing.rows?.length) throw Object.assign(new Error('ช่วงเวลานี้ถูกจองแล้ว'), { code: 'CONFLICT' });

  const allServices = await listProviderServices(pool, talentUuid, true);
  const mainItem = allServices.find((s) => s.id === String(main_item_id) && s.item_type === 'main');
  if (!mainItem) throw Object.assign(new Error('เลือกบริการหลัก'), { code: 'VALIDATION' });
  const addonIds = Array.isArray(addon_item_ids) ? addon_item_ids.map(String) : [];
  const addons = allServices.filter((s) => s.item_type === 'addon' && addonIds.includes(s.id));
  const selectedItems = [mainItem, ...addons];
  const serviceSubtotal = round2(selectedItems.reduce((sum, i) => sum + i.price, 0));

  let transportTotal = 0;
  let transportDistanceKm = 0;
  let transportRate = null;
  const baseFare = Number(policy.transport_base_fare_thb) || 45;
  let serviceAddressJson = null;
  if (location_mode === 'at_home') {
    if (customer_lat == null || customer_lng == null) {
      throw Object.assign(new Error('กรุณาเลือกจุดบนแผนที่'), { code: 'VALIDATION' });
    }
    const quote = await getTransportQuote(pool, talentUuid, customer_lat, customer_lng);
    transportTotal = quote.transport_total;
    transportDistanceKm = quote.distance_km;
    transportRate = quote.transport_rate_per_km;
    serviceAddressJson = {
      lat: Number(customer_lat),
      lng: Number(customer_lng),
      address: customer_address ? String(customer_address) : null,
    };
  }

  const quotedPrice = round2(serviceSubtotal + transportTotal);
  const bookerVipRow = await pool.query('SELECT vip_tier FROM users WHERE id = $1 LIMIT 1', [bookerUuid]);
  const bookerVipTier = bookerVipRow.rows?.[0]?.vip_tier || 'none';
  const { employerServiceFee, employerTotal } = calcBookingFees({
    profile: 'service_merchant',
    action: 'employer_outflow',
    quotedPrice,
    policy,
    bookerVipTier,
  });
  const { mode: payMode, principal } = calcDepositPrincipal(quotedPrice, settings, reqPayMode);
  const remainingBalance = employerTotal;

  const ins = await pool.query(
    `INSERT INTO bookings (
       slot_id, booker_id, talent_id, status, deposit_amount, deposit_status,
       booking_type, location_mode, service_address_json,
       service_subtotal, transport_base_fare, transport_distance_km, transport_rate_per_km, transport_total,
       quoted_price, employer_service_fee, employer_total, selected_items_json,
       amount_paid, remaining_balance, payment_mode,
       vehicle_type_snapshot, vehicle_plate_snapshot, session_status
     ) VALUES (
       $1, $2, $3, 'pending', $4, 'none',
       'beauty', $5, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15,
       0, $16, $17,
       $18, $19, 'awaiting_checkin'
     )
     RETURNING *`,
    [
      slot.id,
      bookerUuid,
      talentUuid,
      principal,
      location_mode,
      serviceAddressJson ? JSON.stringify(serviceAddressJson) : null,
      serviceSubtotal,
      location_mode === 'at_home' ? baseFare : 0,
      location_mode === 'at_home' ? transportDistanceKm : null,
      transportRate,
      transportTotal,
      quotedPrice,
      employerServiceFee,
      employerTotal,
      JSON.stringify(selectedItems),
      employerTotal,
      payMode,
      location_mode === 'at_home' ? settings.vehicle_type : null,
      location_mode === 'at_home' ? settings.vehicle_plate : null,
    ],
  );
  const row = ins.rows[0];
  return formatBeautyBooking(row, slot, policy);
}

function formatBeautyBooking(row, slot, policy) {
  const payout = calcBeautyProviderPayout(
    row.service_subtotal,
    row.transport_total || 0,
    policy || {},
  );
  return {
    id: String(row.id),
    slot_id: String(row.slot_id),
    booker_id: String(row.booker_id),
    talent_id: String(row.talent_id),
    status: row.status,
    booking_type: row.booking_type || 'beauty',
    location_mode: row.location_mode,
    service_address_json: row.service_address_json,
    service_subtotal: Number(row.service_subtotal) || 0,
    transport_base_fare: row.transport_base_fare != null ? Number(row.transport_base_fare) : 0,
    transport_distance_km: row.transport_distance_km != null ? Number(row.transport_distance_km) : null,
    transport_rate_per_km: row.transport_rate_per_km != null ? Number(row.transport_rate_per_km) : null,
    transport_total: Number(row.transport_total) || 0,
    quoted_price: Number(row.quoted_price) || 0,
    employer_service_fee: Number(row.employer_service_fee) || 0,
    employer_total: Number(row.employer_total) || 0,
    selected_items_json: row.selected_items_json,
    amount_paid: Number(row.amount_paid) || 0,
    remaining_balance: row.remaining_balance != null ? Number(row.remaining_balance) : null,
    payment_mode: row.payment_mode,
    deposit_amount: Number(row.deposit_amount) || 0,
    deposit_status: row.deposit_status || 'none',
    session_status: row.session_status || 'awaiting_checkin',
    vehicle_type_snapshot: row.vehicle_type_snapshot,
    vehicle_plate_snapshot: row.vehicle_plate_snapshot,
    provider_payout_preview: payout,
    start_time: slot?.start_time || null,
    end_time: slot?.end_time || null,
    created_at: row.created_at,
  };
}

export async function payBeautyBooking(pool, bookerUuid, bookingId, { isRemaining = false } = {}) {
  const policy = await getBeautyPolicy(pool);
  const bookRow = await pool.query(
    `SELECT b.*, s.start_time, s.end_time FROM bookings b
     JOIN availability_slots s ON s.id = b.slot_id
     WHERE (b.id::text = $1 OR b.id = $1::uuid) AND b.booking_type = 'beauty' LIMIT 1`,
    [bookingId],
  );
  if (!bookRow.rows?.length) throw Object.assign(new Error('ไม่พบการจอง'), { code: 'NOT_FOUND' });
  const b = bookRow.rows[0];
  if (String(b.booker_id) !== String(bookerUuid)) {
    throw Object.assign(new Error('ไม่มีสิทธิ์'), { code: 'FORBIDDEN' });
  }
  if (b.status !== 'confirmed') {
    throw Object.assign(new Error('ชำระได้เมื่อช่างยืนยันคิวแล้ว'), { code: 'VALIDATION' });
  }
  const quoted = Number(b.quoted_price) || 0;
  const employerFee = Number(b.employer_service_fee) || 0;
  const employerTotal = Number(b.employer_total) || 0;
  const amountPaid = Number(b.amount_paid) || 0;
  let principalPortion = 0;
  if (isRemaining) {
    if (amountPaid >= employerTotal - 0.01) {
      throw Object.assign(new Error('ชำระครบแล้ว'), { code: 'VALIDATION' });
    }
    const remainingPrincipal = round2(quoted - (Number(b.deposit_amount) || 0));
    principalPortion = Math.max(0, remainingPrincipal);
  } else {
    if ((b.deposit_status || '').toLowerCase() === 'held' && amountPaid > 0) {
      throw Object.assign(new Error('ชำระมัดจำแล้ว'), { code: 'VALIDATION' });
    }
    principalPortion = Number(b.deposit_amount) || 0;
  }
  const { totalCharge, feePortion } = calcBeautyPaymentCharge(principalPortion, quoted, employerFee);
  if (totalCharge <= 0) throw Object.assign(new Error('ไม่มียอดชำระ'), { code: 'VALIDATION' });

  const walletRow = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [bookerUuid]);
  const balance = parseFloat(walletRow.rows?.[0]?.wallet_balance || 0);
  if (balance < totalCharge) {
    throw Object.assign(new Error(`ยอดในกระเป๋าไม่พอ (ต้องการ ฿${totalCharge.toLocaleString()})`), { code: 'INSUFFICIENT' });
  }

  await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2', [totalCharge, bookerUuid]);
  const newAmountPaid = round2(amountPaid + totalCharge);
  const newDepositPrincipal = round2((Number(b.deposit_amount) || 0) + principalPortion);
  const newRemaining = round2(Math.max(0, employerTotal - newAmountPaid));
  const depositStatus = newRemaining <= 0.01 ? 'held' : 'pending';

  await pool.query(
    `UPDATE bookings SET
       amount_paid = $1, deposit_amount = $2, remaining_balance = $3,
       deposit_status = $4, updated_at = NOW()
     WHERE id = $5`,
    [newAmountPaid, newDepositPrincipal, newRemaining, depositStatus, b.id],
  );

  if (feePortion > 0) {
    const platformUser = await pool.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").catch(() => ({ rows: [] }));
    if (platformUser.rows?.length) {
      await pool.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2::uuid',
        [feePortion, platformUser.rows[0].id],
      );
    }
  }

  return { success: true, amount_charged: totalCharge, amount_paid: newAmountPaid, remaining_balance: newRemaining, deposit_status: depositStatus };
}

export async function saveWorkPhotos(pool, talentUuid, bookingId, phase, photoUrls) {
  if (!['before', 'after'].includes(phase)) throw Object.assign(new Error('phase invalid'), { code: 'VALIDATION' });
  const urls = Array.isArray(photoUrls) ? photoUrls.filter(Boolean).map(String) : [];
  const policy = await getBeautyPolicy(pool);
  const minPhotos = Number(policy.min_completion_photos) || 4;
  if (urls.length < minPhotos) {
    throw Object.assign(new Error(`ต้องอัปโหลดรูปอย่างน้อย ${minPhotos} รูป`), { code: 'VALIDATION' });
  }
  const bookRow = await pool.query(
    `SELECT * FROM bookings WHERE (id::text = $1 OR id = $1::uuid) AND talent_id = $2 AND booking_type = 'beauty' LIMIT 1`,
    [bookingId, talentUuid],
  );
  if (!bookRow.rows?.length) throw Object.assign(new Error('ไม่พบการจอง'), { code: 'NOT_FOUND' });
  const b = bookRow.rows[0];
  if (phase === 'before') {
    if ((b.deposit_status || '').toLowerCase() !== 'held') {
      throw Object.assign(new Error('ลูกค้ายังชำระเงินไม่ครบ — รอชำระก่อนเริ่มงาน'), { code: 'VALIDATION' });
    }
    if (!['awaiting_checkin', 'in_progress'].includes(b.session_status || '')) {
      throw Object.assign(new Error('ไม่สามารถอัปโหลดรูปก่อนงานในสถานะนี้'), { code: 'VALIDATION' });
    }
  }
  if (phase === 'after') {
    if ((b.session_status || '') !== 'in_progress' && b.status !== 'in_progress') {
      throw Object.assign(new Error('ต้องบันทึกรูปก่อนงานและเริ่มให้บริการก่อน'), { code: 'VALIDATION' });
    }
  }
  await pool.query(
    `INSERT INTO booking_work_photos (booking_id, phase, photo_urls, submitted_by)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (booking_id, phase) DO UPDATE SET photo_urls = EXCLUDED.photo_urls, submitted_at = NOW(), submitted_by = EXCLUDED.submitted_by`,
    [b.id, phase, JSON.stringify(urls), talentUuid],
  );
  if (phase === 'before' && b.session_status === 'awaiting_checkin') {
    await pool.query(
      `UPDATE bookings SET session_status = 'in_progress', status = 'in_progress', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [b.id],
    );
  }
  return { ok: true, phase, count: urls.length };
}

export async function submitBeautyCompletion(pool, talentUuid, bookingId) {
  const policy = await getBeautyPolicy(pool);
  const bookRow = await pool.query(
    `SELECT * FROM bookings WHERE (id::text = $1 OR id = $1::uuid) AND talent_id = $2 AND booking_type = 'beauty' LIMIT 1`,
    [bookingId, talentUuid],
  );
  if (!bookRow.rows?.length) throw Object.assign(new Error('ไม่พบการจอง'), { code: 'NOT_FOUND' });
  const b = bookRow.rows[0];
  if (Number(b.amount_paid) < Number(b.employer_total) - 0.01) {
    throw Object.assign(new Error('ลูกค้ายังชำระไม่ครบ'), { code: 'VALIDATION' });
  }
  const photos = await pool.query(
    `SELECT phase FROM booking_work_photos WHERE booking_id = $1`,
    [b.id],
  );
  const phases = new Set((photos.rows || []).map((r) => r.phase));
  if (!phases.has('before') || !phases.has('after')) {
    throw Object.assign(new Error('ต้องมีรูปก่อนและหลังงาน'), { code: 'VALIDATION' });
  }
  await pool.query(
    `UPDATE bookings SET session_status = 'awaiting_acceptance', updated_at = NOW() WHERE id = $1`,
    [b.id],
  );
  return { ok: true, session_status: 'awaiting_acceptance' };
}

export async function acceptBeautyCompletion(pool, bookerUuid, bookingId) {
  const policy = await getBeautyPolicy(pool);
  const holdHours = Number(policy.payout_withdraw_hold_hours) || 24;
  const bookRow = await pool.query(
    `SELECT * FROM bookings WHERE (id::text = $1 OR id = $1::uuid) AND booker_id = $2 AND booking_type = 'beauty' LIMIT 1`,
    [bookingId, bookerUuid],
  );
  if (!bookRow.rows?.length) throw Object.assign(new Error('ไม่พบการจอง'), { code: 'NOT_FOUND' });
  const b = bookRow.rows[0];
  if (b.session_status !== 'awaiting_acceptance') {
    throw Object.assign(new Error('ยังไม่พร้อมยอมรับงาน'), { code: 'VALIDATION' });
  }
  const openDispute = await pool.query(
    `SELECT id FROM booking_disputes WHERE booking_id = $1 AND status = 'open' LIMIT 1`,
    [b.id],
  );
  if (openDispute.rows?.length) {
    throw Object.assign(new Error('มีข้อพิพาทเปิดอยู่ — รอแอดมินพิจารณา'), { code: 'DISPUTE_OPEN' });
  }
  const talentVipRow = await pool.query('SELECT vip_tier FROM users WHERE id = $1 LIMIT 1', [b.talent_id]);
  const payout = calcBeautyProviderPayout(b.service_subtotal, b.transport_total || 0, policy, {
    talentVipTier: talentVipRow.rows?.[0]?.vip_tier || 'none',
  });
  const withdrawableAt = new Date(Date.now() + holdHours * 3600 * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
      [payout.talentPayout, b.talent_id],
    );
    await client.query(
      `UPDATE bookings SET session_status = 'completed', status = 'completed',
         payout_released_at = NOW(), withdrawable_at = $1, updated_at = NOW() WHERE id = $2`,
      [withdrawableAt, b.id],
    );
    const platformUser = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (platformUser.rows?.length && payout.platformRevenue > 0) {
      await client.query(
        'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2::uuid',
        [payout.platformRevenue, platformUser.rows[0].id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { ok: true, talent_payout: payout.talentPayout, withdrawable_at: withdrawableAt.toISOString(), payout };
}

export async function unlockBeautyPayouts(pool) {
  const r = await pool.query(
    `SELECT b.id, b.talent_id, b.service_subtotal, b.transport_total
     FROM bookings b
     WHERE b.booking_type = 'beauty' AND b.status = 'completed'
       AND b.withdrawable_at IS NOT NULL AND b.withdrawable_at <= NOW()
       AND b.payout_released_at IS NOT NULL
       AND COALESCE(b.beauty_withdrawable_unlocked, false) = false
     LIMIT 50`,
  );
  let unlocked = 0;
  const policy = await getBeautyPolicy(pool);
  for (const row of r.rows || []) {
    const payout = calcBeautyProviderPayout(row.service_subtotal, row.transport_total || 0, policy);
    await pool.query(
      `UPDATE users SET wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1, updated_at = NOW() WHERE id = $2`,
      [payout.talentPayout, row.talent_id],
    );
    await pool.query(
      `UPDATE bookings SET beauty_withdrawable_unlocked = true, updated_at = NOW() WHERE id = $1`,
      [row.id],
    );
    unlocked += 1;
  }
  return { unlocked };
}

export { calcBeautyProviderPayout };

function parsePhotoUrls(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

export async function listAdminBeautyBookings(pool, filters = {}) {
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const params = [];
  const where = [`b.booking_type = 'beauty'`];
  if (filters.status) {
    params.push(String(filters.status));
    where.push(`b.status = $${params.length}`);
  }
  if (filters.session_status) {
    params.push(String(filters.session_status));
    where.push(`b.session_status = $${params.length}`);
  }
  const r = await pool.query(
    `SELECT b.id, b.status, b.session_status, b.location_mode,
            b.service_subtotal, b.transport_total, b.quoted_price,
            b.employer_service_fee, b.employer_total, b.amount_paid, b.remaining_balance,
            b.deposit_status, b.payment_mode, b.created_at, b.updated_at,
            b.payout_released_at, b.withdrawable_at, b.beauty_withdrawable_unlocked,
            b.booker_id, b.talent_id,
            s.start_time, s.end_time,
            booker.full_name AS booker_name, booker.phone AS booker_phone,
            talent.full_name AS talent_name, talent.phone AS talent_phone
     FROM bookings b
     JOIN availability_slots s ON s.id = b.slot_id
     LEFT JOIN users booker ON booker.id = b.booker_id
     LEFT JOIN users talent ON talent.id = b.talent_id
     WHERE ${where.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  return (r.rows || []).map((row) => ({
    id: String(row.id),
    status: row.status,
    session_status: row.session_status,
    location_mode: row.location_mode,
    service_subtotal: Number(row.service_subtotal) || 0,
    transport_total: Number(row.transport_total) || 0,
    quoted_price: Number(row.quoted_price) || 0,
    employer_service_fee: Number(row.employer_service_fee) || 0,
    employer_total: Number(row.employer_total) || 0,
    amount_paid: Number(row.amount_paid) || 0,
    remaining_balance: Number(row.remaining_balance) || 0,
    deposit_status: row.deposit_status,
    payment_mode: row.payment_mode,
    start_time: row.start_time,
    end_time: row.end_time,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payout_released_at: row.payout_released_at,
    withdrawable_at: row.withdrawable_at,
    beauty_withdrawable_unlocked: !!row.beauty_withdrawable_unlocked,
    booker_id: String(row.booker_id),
    talent_id: String(row.talent_id),
    booker_name: row.booker_name,
    booker_phone: row.booker_phone,
    talent_name: row.talent_name,
    talent_phone: row.talent_phone,
  }));
}

export async function getAdminBeautyBookingDetail(pool, bookingId) {
  const r = await pool.query(
    `SELECT b.*, s.start_time, s.end_time,
            booker.full_name AS booker_name, booker.phone AS booker_phone, booker.email AS booker_email,
            talent.full_name AS talent_name, talent.phone AS talent_phone, talent.email AS talent_email
     FROM bookings b
     JOIN availability_slots s ON s.id = b.slot_id
     LEFT JOIN users booker ON booker.id = b.booker_id
     LEFT JOIN users talent ON talent.id = b.talent_id
     WHERE (b.id::text = $1 OR b.id = $1::uuid) AND b.booking_type = 'beauty' LIMIT 1`,
    [bookingId],
  );
  if (!r.rows?.length) throw Object.assign(new Error('not_found'), { code: 'NOT_FOUND' });
  const b = r.rows[0];
  const photos = await pool.query(
    `SELECT phase, photo_urls, submitted_at FROM booking_work_photos WHERE booking_id = $1`,
    [b.id],
  );
  const policy = await getBeautyPolicy(pool);
  const payout = calcBeautyProviderPayout(b.service_subtotal, b.transport_total || 0, policy);
  return {
    booking: {
      id: String(b.id),
      status: b.status,
      session_status: b.session_status,
      location_mode: b.location_mode,
      service_subtotal: Number(b.service_subtotal) || 0,
      transport_base_fare: b.transport_base_fare != null ? Number(b.transport_base_fare) : null,
      transport_distance_km: b.transport_distance_km != null ? Number(b.transport_distance_km) : null,
      transport_rate_per_km: b.transport_rate_per_km != null ? Number(b.transport_rate_per_km) : null,
      transport_total: Number(b.transport_total) || 0,
      quoted_price: Number(b.quoted_price) || 0,
      employer_service_fee: Number(b.employer_service_fee) || 0,
      employer_total: Number(b.employer_total) || 0,
      amount_paid: Number(b.amount_paid) || 0,
      remaining_balance: Number(b.remaining_balance) || 0,
      deposit_status: b.deposit_status,
      payment_mode: b.payment_mode,
      selected_items_json: b.selected_items_json,
      service_address_json: b.service_address_json,
      vehicle_type_snapshot: b.vehicle_type_snapshot,
      vehicle_plate_snapshot: b.vehicle_plate_snapshot,
      start_time: b.start_time,
      end_time: b.end_time,
      created_at: b.created_at,
      updated_at: b.updated_at,
      cancelled_at: b.cancelled_at,
      cancel_reason: b.cancel_reason,
      payout_released_at: b.payout_released_at,
      withdrawable_at: b.withdrawable_at,
      beauty_withdrawable_unlocked: !!b.beauty_withdrawable_unlocked,
      booker_id: String(b.booker_id),
      talent_id: String(b.talent_id),
      booker_name: b.booker_name,
      booker_phone: b.booker_phone,
      booker_email: b.booker_email,
      talent_name: b.talent_name,
      talent_phone: b.talent_phone,
      talent_email: b.talent_email,
    },
    photos: (photos.rows || []).map((row) => ({
      phase: row.phase,
      photo_urls: parsePhotoUrls(row.photo_urls),
      submitted_at: row.submitted_at,
    })),
    provider_payout: payout,
    policy,
  };
}

export async function updateBeautyPolicy(pool, patch, adminUserId = null) {
  const cur = await getBeautyPolicy(pool);
  const next = { ...cur };
  const numKeys = [
    'cancel_notice_hours', 'no_show_fee_percent', 'no_show_fee_platform_share',
    'no_show_fee_provider_share', 'payout_withdraw_hold_hours', 'min_completion_photos',
    'transport_base_fare_thb', 'transport_rate_min_km', 'transport_rate_max_km',
    'employer_service_fee_percent', 'service_sourcing_percent', 'service_commission_percent',
    'transport_platform_fee_percent',
  ];
  for (const k of numKeys) {
    if (patch[k] != null && patch[k] !== '') {
      next[k] = Number(patch[k]);
    }
  }
  const tierKeys = [
    'employer_service_fee_by_tier',
    'service_sourcing_by_tier',
    'service_commission_by_tier',
    'transport_platform_fee_by_tier',
  ];
  for (const k of tierKeys) {
    if (patch[k] != null && typeof patch[k] === 'object') {
      next[k] = { ...(next[k] && typeof next[k] === 'object' ? next[k] : {}), ...patch[k] };
    }
  }
  if (typeof patch.use_vip_tier_overrides === 'boolean') {
    next.use_vip_tier_overrides = patch.use_vip_tier_overrides;
  }
  validateMerchantHubPolicyPatch(cur, next);

  if (adminUserId) {
    try {
      await pool.query(
        `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason)
         VALUES ('admin', $1, 'SETTING_CHANGE', 'payout_config', 'beauty_booking_policy', $2, $3, 'Merchant Hub booking policy update')`,
        [adminUserId, JSON.stringify(cur), JSON.stringify(next)],
      );
    } catch (e) {
      console.warn('[beauty] financial_audit_log insert failed:', e?.message);
    }
  }

  await pool.query(
    `INSERT INTO payout_config (key, value_json, updated_at)
     VALUES ('beauty_booking_policy', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  return next;
}

export async function createBeautyDispute(pool, bookerUuid, bookingId, reason) {
  const text = String(reason || '').trim();
  if (text.length < 10) {
    throw Object.assign(new Error('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'), { code: 'VALIDATION' });
  }
  const bookRow = await pool.query(
    `SELECT * FROM bookings WHERE (id::text = $1 OR id = $1::uuid) AND booker_id = $2 AND booking_type = 'beauty' LIMIT 1`,
    [bookingId, bookerUuid],
  );
  if (!bookRow.rows?.length) throw Object.assign(new Error('ไม่พบการจอง'), { code: 'NOT_FOUND' });
  const b = bookRow.rows[0];
  if (b.session_status !== 'awaiting_acceptance') {
    throw Object.assign(new Error('โต้แย้งได้เมื่อช่างส่งงานแล้วและรอยอมรับ'), { code: 'VALIDATION' });
  }
  const existing = await pool.query(
    `SELECT id FROM booking_disputes WHERE booking_id = $1 AND status = 'open' LIMIT 1`,
    [b.id],
  );
  if (existing.rows?.length) {
    throw Object.assign(new Error('มีข้อพิพาทเปิดอยู่แล้ว'), { code: 'VALIDATION' });
  }
  const ins = await pool.query(
    `INSERT INTO booking_disputes (booking_id, opened_by, reason, status)
     VALUES ($1, $2, $3, 'open') RETURNING id, created_at`,
    [b.id, bookerUuid, text],
  );
  await pool.query(
    `UPDATE bookings SET session_status = 'disputed', updated_at = NOW() WHERE id = $1`,
    [b.id],
  );
  return { ok: true, dispute_id: String(ins.rows[0].id), session_status: 'disputed' };
}

export async function listAdminBeautyDisputes(pool, status = 'open') {
  const params = [];
  let where = `b.booking_type = 'beauty' AND d.status = $1`;
  params.push(status || 'open');
  const r = await pool.query(
    `SELECT d.id, d.booking_id, d.reason, d.status, d.resolution, d.refund_amount,
            d.created_at, d.resolved_at,
            b.employer_total, b.amount_paid, b.session_status, b.status AS booking_status,
            b.talent_id, b.booker_id,
            booker.full_name AS booker_name, talent.full_name AS talent_name
     FROM booking_disputes d
     JOIN bookings b ON b.id = d.booking_id
     LEFT JOIN users booker ON booker.id = b.booker_id
     LEFT JOIN users talent ON talent.id = b.talent_id
     WHERE ${where}
     ORDER BY d.created_at DESC
     LIMIT 100`,
    params,
  );
  return (r.rows || []).map((row) => ({
    id: String(row.id),
    booking_id: String(row.booking_id),
    reason: row.reason,
    status: row.status,
    resolution: row.resolution,
    refund_amount: row.refund_amount != null ? Number(row.refund_amount) : null,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    employer_total: Number(row.employer_total) || 0,
    amount_paid: Number(row.amount_paid) || 0,
    session_status: row.session_status,
    booking_status: row.booking_status,
    booker_id: String(row.booker_id),
    talent_id: String(row.talent_id),
    booker_name: row.booker_name,
    talent_name: row.talent_name,
  }));
}

export async function resolveBeautyDispute(pool, adminUserId, disputeId, body) {
  const resolution = String(body.resolution || '').trim();
  if (!['refund_customer', 'release_provider', 'reject_dispute'].includes(resolution)) {
    throw Object.assign(new Error('resolution invalid'), { code: 'VALIDATION' });
  }
  const note = body.resolution_note ? String(body.resolution_note).trim() : null;
  const dRow = await pool.query(
    `SELECT d.id AS dispute_id, d.booking_id, d.status AS dispute_status, d.opened_by,
            b.amount_paid, b.booker_id, b.session_status, b.booking_type
     FROM booking_disputes d
     JOIN bookings b ON b.id = d.booking_id
     WHERE d.id::text = $1 OR d.id = $1::uuid LIMIT 1`,
    [disputeId],
  );
  if (!dRow.rows?.length) throw Object.assign(new Error('not_found'), { code: 'NOT_FOUND' });
  const d = dRow.rows[0];
  if (d.dispute_status !== 'open') {
    throw Object.assign(new Error('ข้อพิพาทปิดแล้ว'), { code: 'VALIDATION' });
  }

  const bookingId = String(d.booking_id);
  const bookerId = d.booker_id;
  const disputeIdUuid = d.dispute_id;

  if (resolution === 'release_provider') {
    await pool.query(
      `UPDATE booking_disputes SET status = 'resolved', resolution = $1, resolution_note = $2,
         resolved_by = $3, resolved_at = NOW() WHERE id = $4`,
      [resolution, note, adminUserId, disputeIdUuid],
    );
    await pool.query(
      `UPDATE bookings SET session_status = 'awaiting_acceptance', updated_at = NOW() WHERE id = $1`,
      [d.booking_id],
    );
    await acceptBeautyCompletion(pool, bookerId, bookingId);
    return { ok: true, resolution, message: 'ปล่อยเงินให้ช่างแล้ว' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (resolution === 'refund_customer') {
      const refund = Math.max(0, Number(d.amount_paid) || 0);
      if (refund > 0 && d.booker_id) {
        await client.query(
          `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [refund, d.booker_id],
        );
      }
      await client.query(
        `UPDATE bookings SET status = 'cancelled', session_status = 'completed',
           deposit_status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [d.booking_id],
      );
      await client.query(
        `UPDATE booking_disputes SET status = 'resolved', resolution = $1, resolution_note = $2,
           refund_amount = $3, resolved_by = $4, resolved_at = NOW() WHERE id = $5`,
        [resolution, note, refund, adminUserId, disputeIdUuid],
      );
    } else {
      await client.query(
        `UPDATE booking_disputes SET status = 'rejected', resolution = $1, resolution_note = $2,
           resolved_by = $3, resolved_at = NOW() WHERE id = $4`,
        [resolution, note, adminUserId, disputeIdUuid],
      );
      await client.query(
        `UPDATE bookings SET session_status = 'awaiting_acceptance', updated_at = NOW() WHERE id = $1`,
        [d.booking_id],
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, resolution };
}
