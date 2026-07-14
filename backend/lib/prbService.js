/**
 * PRB (Compulsory Motor Insurance) service — FairDee-compatible data capture.
 */
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { extractVehicleRegistration } from './prbOcrProvider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRB_CAR_TYPES = ['sedan', 'pickup', 'motorcycle'];
/** เบี้ย พ.ร.บ. อ้างอิง FairDee — ปรับได้จาก admin */
const PRB_DEFAULT_BASE_PREMIUM = 645.21;
const PRB_DEFAULT_PLATFORM_FEE = { sedan: 10, pickup: 10, motorcycle: 5 };

const DEFAULT_CONFIG = {
  enabled: true,
  min_wallet_for_entry_thb: 700,
  first_order_discount_thb: 100,
  platform_fee_by_car_type: { ...PRB_DEFAULT_PLATFORM_FEE },
  base_price_by_car_type: {
    sedan: PRB_DEFAULT_BASE_PREMIUM,
    pickup: PRB_DEFAULT_BASE_PREMIUM,
    motorcycle: PRB_DEFAULT_BASE_PREMIUM,
  },
  excluded_providers: ['iCare', 'ไทยไพบูลย์', 'วิริยะ', 'Thai Paiboon', 'Viriyah'],
  default_coverage_days: 365,
  address_line_max_chars: 15,
  loyalty_points_on_confirm: 10,
  promo_banner_text: 'เติมเงิน {min} บาท รับส่วนลด {discount} บาท สำหรับต่อ พ.ร.บ. ครั้งแรก',
};

export function resolvePrbPromoBannerText(config) {
  const min = Number(config?.min_wallet_for_entry_thb) || 700;
  const discount = Number(config?.first_order_discount_thb) || 0;
  const template = String(config?.promo_banner_text || '').trim();
  if (template.includes('{min}') || template.includes('{discount}')) {
    return template
      .replace(/\{min\}/g, min.toLocaleString())
      .replace(/\{discount\}/g, discount.toLocaleString());
  }
  return `เติมเงิน ${min.toLocaleString()} บาท รับส่วนลด ${discount.toLocaleString()} บาท สำหรับต่อ พ.ร.บ. ครั้งแรก`;
}

function withResolvedPromoBanner(config) {
  return {
    ...config,
    promo_banner_text: resolvePrbPromoBannerText(config),
  };
}

let addressSeedPromise = null;

function mergePrbConfig(parsed = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    platform_fee_by_car_type: {
      ...DEFAULT_CONFIG.platform_fee_by_car_type,
      ...(parsed.platform_fee_by_car_type || {}),
    },
    base_price_by_car_type: {
      ...DEFAULT_CONFIG.base_price_by_car_type,
      ...(parsed.base_price_by_car_type || {}),
    },
  };
}

function readConfiguredAmount(map, carType, fallback) {
  const n = Number(map?.[carType]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

export function buildPrbPublicPayload(config) {
  const cfg = withResolvedPromoBanner(config);
  const pricing_by_car_type = {};
  for (const carType of PRB_CAR_TYPES) {
    const p = calcPricing({ car_type: carType }, cfg, false);
    pricing_by_car_type[carType] = { base: p.base, fee: p.fee };
  }
  return { ...cfg, pricing_by_car_type };
}

export async function getPrbConfig(pool) {
  try {
    const r = await pool.query(`SELECT value_json FROM payout_config WHERE key = 'prb_module'`);
    const raw = r.rows[0]?.value_json;
    if (!raw) return withResolvedPromoBanner(mergePrbConfig({}));
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return withResolvedPromoBanner(mergePrbConfig(parsed));
  } catch {
    return withResolvedPromoBanner(mergePrbConfig({}));
  }
}

async function loadAddressSeedFile() {
  const path = join(__dirname, '..', 'data', 'thailandAddressesSeed.json');
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

export async function seedThAddressesIfEmpty(pool) {
  const count = await pool.query(`SELECT COUNT(*)::int AS c FROM aqond_th_addresses`);
  if ((count.rows[0]?.c || 0) > 0) return false;

  const seed = await loadAddressSeedFile();
  let sort = 0;

  for (const prov of seed.provinces || []) {
    const pRes = await pool.query(
      `INSERT INTO aqond_th_addresses (parent_id, level, name_th, sort_order)
       VALUES (NULL, 'province', $1, $2) RETURNING id`,
      [prov.name, sort++]
    );
    const provId = pRes.rows[0].id;
    let dSort = 0;
    for (const dist of prov.districts || []) {
      const dRes = await pool.query(
        `INSERT INTO aqond_th_addresses (parent_id, level, name_th, sort_order)
         VALUES ($1, 'district', $2, $3) RETURNING id`,
        [provId, dist.name, dSort++]
      );
      const distId = dRes.rows[0].id;
      let sSort = 0;
      for (const sub of dist.subdistricts || []) {
        await pool.query(
          `INSERT INTO aqond_th_addresses (parent_id, level, name_th, postal_code, sort_order)
           VALUES ($1, 'subdistrict', $2, $3, $4)`,
          [distId, sub.name, sub.postal || null, sSort++]
        );
      }
    }
  }

  for (const name of seed.extra_provinces || []) {
    await pool.query(
      `INSERT INTO aqond_th_addresses (parent_id, level, name_th, sort_order)
       VALUES (NULL, 'province', $1, $2)
       ON CONFLICT DO NOTHING`,
      [name, sort++]
    );
  }

  return true;
}

export async function ensureAddressData(pool) {
  if (!addressSeedPromise) {
    addressSeedPromise = seedThAddressesIfEmpty(pool).catch((e) => {
      addressSeedPromise = null;
      throw e;
    });
  }
  return addressSeedPromise;
}

export async function getThAddressProvinces(pool) {
  await ensureAddressData(pool);
  const r = await pool.query(
    `SELECT id, name_th AS name FROM aqond_th_addresses
     WHERE level = 'province' ORDER BY sort_order, name_th`
  );
  return r.rows;
}

export async function getThAddressChildren(pool, parentId) {
  await ensureAddressData(pool);
  const pid = parseInt(String(parentId), 10);
  if (!Number.isFinite(pid)) return [];
  const r = await pool.query(
    `SELECT id, name_th AS name, level, postal_code
     FROM aqond_th_addresses WHERE parent_id = $1
     ORDER BY sort_order, name_th`,
    [pid]
  );
  return r.rows;
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function normCarType(v) {
  const s = String(v || 'sedan').trim().toLowerCase();
  if (s === 'pickup' || s === 'motorcycle') return s;
  return 'sedan';
}

function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function validatePrbOrderPayload(payload, config) {
  const errors = [];
  const maxAddr = config.address_line_max_chars || 15;

  if (!payload.registration_number?.trim()) errors.push('registration_number_required');
  if (!payload.chassis_number?.trim()) errors.push('chassis_number_required');
  if (!payload.first_name?.trim()) errors.push('first_name_required');
  if (!payload.last_name?.trim()) errors.push('last_name_required');
  if (!payload.shipping_address?.trim()) errors.push('shipping_address_required');
  if (!payload.car_registration_img_url?.trim()) errors.push('car_registration_img_required');

  const nid = digitsOnly(payload.national_id);
  if (nid.length !== 13) errors.push('national_id_invalid');

  const phone = digitsOnly(payload.phone_number);
  if (phone.length !== 10) errors.push('phone_number_invalid');

  const addr = String(payload.address_line || '').trim();
  if (!addr) errors.push('address_line_required');
  if (addr.length > maxAddr) errors.push('address_line_too_long');

  if (!payload.address_province?.trim()) errors.push('address_province_required');
  if (!payload.address_district?.trim()) errors.push('address_district_required');
  if (!payload.address_subdistrict?.trim()) errors.push('address_subdistrict_required');
  if (!payload.postal_code?.trim()) errors.push('postal_code_required');

  return { ok: errors.length === 0, errors };
}

export function buildFairdeePayload(orderRow) {
  const o = orderRow || {};
  return {
    version: 1,
    portal: 'agent.fairdee.co.th',
    category: o.insurance_category || 'prb',
    vehicle: {
      carType: o.car_type,
      registrationNumber: o.registration_number,
      registrationProvince: o.registration_province,
      registrationYear: o.registration_year,
      chassisNumber: o.chassis_number,
      chassisSearch7: o.chassis_search_7 || (o.chassis_number ? String(o.chassis_number).slice(-7) : null),
      engineNumber: o.engine_number || '',
      vehicleCode: o.vehicle_code,
      brand: o.vehicle_brand,
      model: o.vehicle_model,
      year: o.vehicle_year,
      engineCc: o.engine_cc,
      weightKg: o.vehicle_weight_kg,
      seats: o.seat_count,
      accessories: o.accessories_json || [],
      coverageStart: o.coverage_start_date,
      coverageEnd: o.coverage_end_date,
    },
    policyholder: {
      idType: o.id_type || 'บัตรประชาชน',
      nationalId: o.national_id,
      namePrefix: o.name_prefix,
      firstName: o.first_name,
      lastName: o.last_name,
      phone: o.phone_number,
      nationality: o.nationality || 'Thailand',
      addressLine: o.address_line,
      province: o.address_province,
      district: o.address_district,
      subdistrict: o.address_subdistrict,
      postalCode: o.postal_code,
    },
    documents: {
      registrationBookUrl: o.car_registration_img_url,
      idCardUrl: o.id_card_img_url || null,
      addressProofUrl: o.address_proof_img_url || null,
      additionalDocs: o.additional_docs_json || [],
      policyPdfUrl: o.policy_pdf_url || null,
    },
    pricing: {
      providerCode: o.provider_code || null,
      providerName: o.provider_name || null,
      basePremium: o.base_premium != null ? Number(o.base_premium) : null,
      vat: o.vat_amount != null ? Number(o.vat_amount) : null,
      stampDuty: o.stamp_duty != null ? Number(o.stamp_duty) : null,
      totalPremium: o.total_premium != null ? Number(o.total_premium) : null,
    },
    tracking: {
      fairdeeQuoteNumber: o.fairdee_quote_number || null,
      policyStatus: o.policy_status || null,
      paymentStatus: o.payment_status || null,
      aqondQuoteNumber: o.quote_number,
      aqondStatus: o.status,
      fairdeeBotStatus: o.fairdee_bot_status,
    },
    aqond: {
      orderId: o.id,
      quoteNumber: o.quote_number,
      platformFee: o.platform_fee != null ? Number(o.platform_fee) : null,
      discountApplied: o.discount_applied != null ? Number(o.discount_applied) : null,
      totalCharged: o.total_price != null ? Number(o.total_price) : null,
      submittedAt: o.submitted_at,
    },
  };
}

async function generateQuoteNumber(client) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM aqond_prb_orders
     WHERE quote_number LIKE $1`,
    [`PRB-${today}-%`]
  );
  const seq = (r.rows[0]?.c || 0) + 1;
  return `PRB-${today}-${String(seq).padStart(3, '0')}`;
}

export async function getWalletEligibility(pool, userId) {
  const config = await getPrbConfig(pool);
  const u = await pool.query(
    `SELECT COALESCE(wallet_balance, 0)::numeric AS balance, full_name, phone, id_card_number
     FROM users WHERE id = $1::uuid`,
    [userId]
  );
  const user = u.rows[0];
  if (!user) return { ok: false, error: 'user_not_found' };

  const balance = Number(user.balance) || 0;
  const promo = await pool.query(
    `SELECT id FROM aqond_prb_promo_entitlements
     WHERE user_id = $1::uuid AND promo_type = 'first_order_100' AND consumed_at IS NULL
     LIMIT 1`,
    [userId]
  );

  return {
    ok: true,
    enabled: config.enabled !== false,
    wallet_balance: balance,
    min_wallet_for_entry_thb: config.min_wallet_for_entry_thb,
    can_enter: balance >= config.min_wallet_for_entry_thb,
    has_promo: promo.rows.length > 0,
    promo_discount_thb: promo.rows.length > 0 ? config.first_order_discount_thb : 0,
    user_profile: {
      full_name: user.full_name,
      phone: user.phone,
      national_id: user.id_card_number,
    },
  };
}

export async function grantPromoOnTopup(pool, userId, grossAmountThb) {
  const config = await getPrbConfig(pool);
  const min = Number(config.min_wallet_for_entry_thb) || 700;
  if (Number(grossAmountThb) < min) return { granted: false, reason: 'below_min' };

  const existing = await pool.query(
    `SELECT id FROM aqond_prb_promo_entitlements
     WHERE user_id = $1::uuid AND promo_type = 'first_order_100' AND consumed_at IS NULL
     LIMIT 1`,
    [userId]
  );
  if (existing.rows.length) return { granted: false, reason: 'already_has_promo' };

  const any = await pool.query(
    `SELECT id FROM aqond_prb_promo_entitlements WHERE user_id = $1::uuid LIMIT 1`,
    [userId]
  );
  if (any.rows.length) return { granted: false, reason: 'promo_already_used' };

  await pool.query(
    `INSERT INTO aqond_prb_promo_entitlements (user_id, promo_type) VALUES ($1::uuid, 'first_order_100')`,
    [userId]
  );
  return { granted: true };
}

function calcPricing(payload, config, hasPromo) {
  const carType = normCarType(payload.car_type);
  const base = readConfiguredAmount(
    config.base_price_by_car_type,
    carType,
    PRB_DEFAULT_BASE_PREMIUM,
  );
  const fee = readConfiguredAmount(
    config.platform_fee_by_car_type,
    carType,
    PRB_DEFAULT_PLATFORM_FEE[carType] ?? 10,
  );
  const discount = hasPromo ? Number(config.first_order_discount_thb) || 0 : 0;
  const total = Math.max(0, Math.round((base + fee - discount) * 100) / 100);
  return { carType, base, fee, discount, total };
}

export async function createOrder(pool, userId, payload) {
  const config = await getPrbConfig(pool);
  const validation = validatePrbOrderPayload(payload, config);
  if (!validation.ok) {
    const err = new Error('validation_failed');
    err.code = 'PRB_VALIDATION';
    err.details = validation.errors;
    throw err;
  }

  const eligibility = await getWalletEligibility(pool, userId);
  if (!eligibility.can_enter) {
    const err = new Error('insufficient_wallet');
    err.code = 'PRB_WALLET_LOW';
    throw err;
  }

  const hasPromo = eligibility.has_promo;
  const pricing = calcPricing(payload, config, hasPromo);

  const coverageStart = payload.coverage_start_date || new Date().toISOString().slice(0, 10);
  const coverageEnd = payload.coverage_end_date || addDays(coverageStart, config.default_coverage_days || 365);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bal = await client.query(
      `SELECT COALESCE(wallet_balance, 0)::numeric AS balance FROM users WHERE id = $1::uuid FOR UPDATE`,
      [userId]
    );
    const balance = Number(bal.rows[0]?.balance) || 0;
    if (balance < pricing.total) {
      const err = new Error('insufficient_wallet');
      err.code = 'PRB_WALLET_LOW';
      throw err;
    }

    let promoId = null;
    if (hasPromo) {
      const pr = await client.query(
        `SELECT id FROM aqond_prb_promo_entitlements
         WHERE user_id = $1::uuid AND promo_type = 'first_order_100' AND consumed_at IS NULL
         FOR UPDATE`,
        [userId]
      );
      promoId = pr.rows[0]?.id || null;
    }

    const quoteNumber = await generateQuoteNumber(client);
    const orderId = crypto.randomUUID();
    const ledgerId = `L-prb-${orderId}`;

    await client.query(
      `UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2::uuid`,
      [pricing.total, userId]
    );

    await client.query(
      `INSERT INTO payment_ledger_audit (
         id, event_type, payment_id, gateway, job_id, amount, currency, status,
         bill_no, transaction_no, user_id, net_amount, metadata
       ) VALUES ($1, 'prb_payment', $2, 'wallet', $2, $3, 'THB', 'completed', $4, $5, $6, $3, $7)`,
      [
        ledgerId,
        orderId,
        pricing.total,
        quoteNumber,
        `T-PRB-${orderId}`,
        userId,
        JSON.stringify({
          order_id: orderId,
          car_type: pricing.carType,
          base: pricing.base,
          platform_fee: pricing.fee,
          discount: pricing.discount,
        }),
      ]
    );

    const chassis = String(payload.chassis_number || '').trim();
    const insert = await client.query(
      `INSERT INTO aqond_prb_orders (
         id, user_id, quote_number, status, insurance_category, car_type,
         registration_year, registration_number, registration_province,
         chassis_number, chassis_search_7, engine_number, vehicle_brand, vehicle_model, vehicle_year,
         engine_cc, vehicle_weight_kg, seat_count, accessories_json,
         coverage_start_date, coverage_end_date,
         id_type, national_id, name_prefix, first_name, last_name, phone_number, nationality,
         address_line, address_province, address_district, address_subdistrict, postal_code, shipping_address,
         car_registration_img_url, id_card_img_url, address_proof_img_url, additional_docs_json,
         base_premium, platform_fee, discount_applied, total_price, ledger_id,
         submitted_at, payment_status
       ) VALUES (
         $1, $2, $3, 'checking', 'prb', $4,
         $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb,
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
         $33, $34, $35, $36::jsonb, $37, $38, $39, $40, $41, NOW(), 'ชำระแล้ว'
       ) RETURNING *`,
      [
        orderId,
        userId,
        quoteNumber,
        pricing.carType,
        payload.registration_year || payload.vehicle_year || null,
        payload.registration_number?.trim(),
        payload.registration_province?.trim() || null,
        chassis,
        payload.chassis_search_7?.trim() || chassis.slice(-7),
        payload.engine_number?.trim() || null,
        payload.vehicle_brand?.trim() || null,
        payload.vehicle_model?.trim() || null,
        payload.vehicle_year || null,
        payload.engine_cc || null,
        payload.vehicle_weight_kg || null,
        payload.seat_count || null,
        JSON.stringify(payload.accessories || []),
        coverageStart,
        coverageEnd,
        payload.id_type || 'บัตรประชาชน',
        digitsOnly(payload.national_id),
        payload.name_prefix?.trim() || 'คุณ',
        payload.first_name?.trim(),
        payload.last_name?.trim(),
        digitsOnly(payload.phone_number),
        payload.nationality || 'Thailand',
        String(payload.address_line || '').trim(),
        payload.address_province?.trim(),
        payload.address_district?.trim(),
        payload.address_subdistrict?.trim(),
        payload.postal_code?.trim(),
        payload.shipping_address?.trim(),
        payload.car_registration_img_url?.trim(),
        payload.id_card_img_url?.trim() || null,
        payload.address_proof_img_url?.trim() || null,
        JSON.stringify(payload.additional_docs || []),
        pricing.base,
        pricing.fee,
        pricing.discount,
        pricing.total,
        ledgerId,
      ]
    );

    const order = insert.rows[0];
    const fairdeePayload = buildFairdeePayload(order);

    await client.query(
      `UPDATE aqond_prb_orders SET fairdee_payload_json = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [orderId, JSON.stringify(fairdeePayload)]
    );
    order.fairdee_payload_json = fairdeePayload;

    if (promoId) {
      await client.query(
        `UPDATE aqond_prb_promo_entitlements
         SET consumed_at = NOW(), consumed_order_id = $2 WHERE id = $1`,
        [promoId, orderId]
      );
    }

    await client.query('COMMIT');
    return { order, fairdee_payload: fairdeePayload, pricing };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    throw e;
  } finally {
    client.release();
  }
}

export async function getActiveOrder(pool, userId) {
  const r = await pool.query(
    `SELECT * FROM aqond_prb_orders
     WHERE user_id = $1::uuid AND status NOT IN ('completed', 'cancelled')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

export async function getOrderHistory(pool, userId, limit = 20) {
  const r = await pool.query(
    `SELECT id, quote_number, status, car_type, registration_number, total_price,
            created_at, shipped_at, completed_at, policy_pdf_url
     FROM aqond_prb_orders WHERE user_id = $1::uuid
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

export async function getOrderById(pool, userId, orderId) {
  const r = await pool.query(
    `SELECT * FROM aqond_prb_orders WHERE id = $1::uuid AND user_id = $2::uuid`,
    [orderId, userId]
  );
  return r.rows[0] || null;
}

export async function confirmOrder(pool, userId, orderId) {
  const config = await getPrbConfig(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT * FROM aqond_prb_orders WHERE id = $1::uuid AND user_id = $2::uuid FOR UPDATE`,
      [orderId, userId]
    );
    const order = r.rows[0];
    if (!order) {
      const err = new Error('order_not_found');
      err.code = 'PRB_NOT_FOUND';
      throw err;
    }
    if (order.status !== 'shipped') {
      const err = new Error('invalid_status');
      err.code = 'PRB_INVALID_STATUS';
      throw err;
    }

    await client.query(
      `UPDATE aqond_prb_orders
       SET status = 'completed', confirmed_at = NOW(), completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    const pts = Number(config.loyalty_points_on_confirm) || 10;
    await client.query(
      `INSERT INTO aqond_prb_loyalty_points (user_id, points, source_order_id) VALUES ($1, $2, $3)`,
      [userId, pts, orderId]
    );

    await client.query('COMMIT');
    return { ok: true, loyalty_points: pts };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { });
    throw e;
  } finally {
    client.release();
  }
}

export async function disputeOrder(pool, userId, orderId, reason) {
  const r = await pool.query(
    `UPDATE aqond_prb_orders
     SET status = 'dispute', dispute_reason = $3, updated_at = NOW()
     WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'shipped'
     RETURNING *`,
    [orderId, userId, String(reason || '').trim() || 'ไม่ระบุ']
  );
  if (!r.rows[0]) {
    const err = new Error('dispute_failed');
    err.code = 'PRB_DISPUTE_FAILED';
    throw err;
  }
  return r.rows[0];
}

export async function adminListOrders(pool, { status, botStatus, tab, limit = 100, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  let n = 1;

  if (status) {
    clauses.push(`o.status = $${n++}`);
    params.push(status);
  }
  if (botStatus) {
    clauses.push(`o.fairdee_bot_status = $${n++}`);
    params.push(botStatus);
  }
  if (tab === 'disputes') {
    clauses.push(`o.status = 'dispute'`);
  } else if (tab === 'shipped') {
    clauses.push(`o.status = 'shipped'`);
  } else if (tab === 'pending_bot') {
    clauses.push(`o.fairdee_bot_status = 'pending' AND o.status IN ('checking', 'processing')`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const r = await pool.query(
    `SELECT o.*, u.full_name AS user_full_name, u.phone AS user_phone, u.email AS user_email
     FROM aqond_prb_orders o
     LEFT JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${n++} OFFSET $${n}`,
    params
  );
  return r.rows;
}

export async function adminGetOrder(pool, orderId) {
  const r = await pool.query(
    `SELECT o.*, u.full_name AS user_full_name, u.phone AS user_phone, u.email AS user_email
     FROM aqond_prb_orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1::uuid`,
    [orderId]
  );
  return r.rows[0] || null;
}

export async function adminUpdateOrder(pool, orderId, patch) {
  const allowed = [
    'status', 'policy_status', 'payment_status', 'fairdee_quote_number',
    'provider_code', 'provider_name', 'vehicle_code',
    'base_premium', 'vat_amount', 'stamp_duty', 'total_premium',
    'policy_pdf_url', 'admin_notes', 'fairdee_bot_status', 'fairdee_bot_error',
  ];
  const sets = [];
  const params = [orderId];
  let n = 2;

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = $${n++}`);
      params.push(patch[key]);
    }
  }

  if (patch.status === 'shipped') {
    sets.push(`shipped_at = COALESCE(shipped_at, NOW())`);
  }
  if (patch.status === 'processing') {
    sets.push(`updated_at = NOW()`);
  }

  if (!sets.length) return adminGetOrder(pool, orderId);

  sets.push('updated_at = NOW()');

  const r = await pool.query(
    `UPDATE aqond_prb_orders SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING *`,
    params
  );
  const order = r.rows[0];
  if (order) {
    const payload = buildFairdeePayload(order);
    await pool.query(
      `UPDATE aqond_prb_orders SET fairdee_payload_json = $2::jsonb WHERE id = $1`,
      [orderId, JSON.stringify(payload)]
    );
    order.fairdee_payload_json = payload;
  }
  return order;
}

function parseNonNegativeFee(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw Object.assign(new Error(`${label}_invalid`), { code: 'PRB_CONFIG_INVALID' });
  }
  return Math.round(n * 100) / 100;
}

export async function updatePrbModuleConfig(pool, patch = {}) {
  const current = await getPrbConfig(pool);
  const next = { ...current };

  if (patch.platform_fee_by_car_type && typeof patch.platform_fee_by_car_type === 'object') {
    const fees = { ...current.platform_fee_by_car_type };
    for (const carType of PRB_CAR_TYPES) {
      if (patch.platform_fee_by_car_type[carType] == null) continue;
      fees[carType] = parseNonNegativeFee(
        patch.platform_fee_by_car_type[carType],
        `platform_fee_${carType}`,
      );
    }
    next.platform_fee_by_car_type = fees;
  }

  if (patch.base_price_by_car_type && typeof patch.base_price_by_car_type === 'object') {
    const prices = { ...current.base_price_by_car_type };
    for (const carType of PRB_CAR_TYPES) {
      if (patch.base_price_by_car_type[carType] == null) continue;
      prices[carType] = parseNonNegativeFee(
        patch.base_price_by_car_type[carType],
        `base_price_${carType}`,
      );
    }
    next.base_price_by_car_type = prices;
  }

  if (patch.enabled != null) next.enabled = Boolean(patch.enabled);
  if (patch.min_wallet_for_entry_thb != null) {
    next.min_wallet_for_entry_thb = parseNonNegativeFee(patch.min_wallet_for_entry_thb, 'min_wallet_for_entry_thb');
  }
  if (patch.first_order_discount_thb != null) {
    next.first_order_discount_thb = parseNonNegativeFee(patch.first_order_discount_thb, 'first_order_discount_thb');
  }
  if (patch.promo_banner_text != null) {
    next.promo_banner_text = String(patch.promo_banner_text).slice(0, 500);
  }

  if (
    patch.first_order_discount_thb != null ||
    patch.min_wallet_for_entry_thb != null ||
    patch.promo_banner_text == null
  ) {
    next.promo_banner_text = resolvePrbPromoBannerText(next);
  }

  await pool.query(
    `INSERT INTO payout_config (key, value_json, updated_at)
     VALUES ('prb_module', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(next)],
  );

  return withResolvedPromoBanner(next);
}

export async function runOcrExtract(params) {
  return extractVehicleRegistration(params);
}
