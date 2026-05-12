/**
 * แบนเนอร์หน้า Home — เก็บใน home_banners (แทน in-memory)
 */

const KNOWN_PLACEMENT_SLUGS = ['home', 'welcome', 'job_detail'];

/**
 * PostgreSQL DATE / timestamp → yyyy-mm-dd ตามปฏิทิน Asia/Bangkok
 * หลีกเลี่ยง off-by-one เมื่อค่ากลับมาเป็น Date แล้วใช้ toISOString().slice(0,10)
 */
export function pgDateCellToYmdBangkok(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const t = Date.parse(trimmed);
    if (!Number.isNaN(t)) {
      return pgDateCellToYmdBangkok(new Date(t));
    }
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const y = parts.find((p) => p.type === 'year')?.value;
    const mo = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && mo && d) return `${y}-${mo}-${d}`;
  }
  return null;
}

function normPlacementsArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  const set = new Set(
    arr
      .map((x) => String(x || '')
        .trim()
        .toLowerCase())
      .filter((x) => KNOWN_PLACEMENT_SLUGS.includes(x))
  );
  if (set.size === 0) return null;
  if (set.size === KNOWN_PLACEMENT_SLUGS.length) return null;
  return KNOWN_PLACEMENT_SLUGS.filter((k) => set.has(k));
}

/** จาก body แอดมิน — undefined = ไม่เปลี่ยน (PATCH); null = ทุกหน้า */
function parsePlacementsFromBody(body) {
  if (body?.placements === undefined) return undefined;
  const raw = body.placements;
  if (raw == null) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return normPlacementsArray(arr);
}

/**
 * กรองแบนเนอร์ตามหน้า (หลัง rowToApi)
 * @param {string|null|undefined} placement - 'home' | 'welcome' | 'job_detail'; ค่าว่าง = ไม่กรอง (backward compatible)
 */
export function filterBannersByPlacement(banners, placement) {
  const p = String(placement || '')
    .trim()
    .toLowerCase();
  if (!p || !KNOWN_PLACEMENT_SLUGS.includes(p)) return banners;
  return (banners || []).filter((b) => {
    const pl = b.placements;
    if (pl == null || !Array.isArray(pl) || pl.length === 0) return true;
    if (pl.includes(p)) return true;
    if (
      pl.length > 0 &&
      !pl.includes(p) &&
      p === 'home' &&
      hasPromoForHomeFallback(b) &&
      pl.some((x) => x === 'welcome' || x === 'job_detail')
    ) {
      return true;
    }
    // สมมาตรกับ home: แบนโปรที่เลือกแค่ home/job_detail แต่ลืมติ๊ก welcome — ยังให้เห็นหน้า Welcome
    if (
      pl.length > 0 &&
      !pl.includes(p) &&
      p === 'welcome' &&
      hasPromoForHomeFallback(b) &&
      pl.some((x) => x === 'home' || x === 'job_detail')
    ) {
      return true;
    }
    // แบนโปรที่เลือกแค่ home/welcome แต่ลืมติ๊ก job_detail
    if (
      pl.length > 0 &&
      !pl.includes(p) &&
      p === 'job_detail' &&
      hasPromoForHomeFallback(b) &&
      pl.some((x) => x === 'home' || x === 'welcome')
    ) {
      return true;
    }
    return false;
  });
}

/** มี promo code = โปรจริง — ควรเห็นบนหลักหลังล็อกอินแม้แอดมินลืมเลือก placement home */
function hasPromoForHomeFallback(b) {
  const code = b?.promoCode != null && String(b.promoCode).trim();
  const maxBaht =
    b?.discountMaxBaht != null &&
    !Number.isNaN(Number(b.discountMaxBaht)) &&
    Number(b.discountMaxBaht) > 0;
  return Boolean(code || maxBaht);
}

function normDiscountMode(row) {
  const m = row?.discount_mode;
  return m === 'percent' ? 'percent' : 'fixed_baht';
}

/** ช่วงใช้โค้ดจริง — ถ้าไม่ตั้ง promo_valid_* ใช้ start_date / end_date (เขต +07) */
export function effectivePromoValidFrom(row) {
  if (!row) return null;
  if (row.promo_valid_from) return new Date(row.promo_valid_from);
  const sd = pgDateCellToYmdBangkok(row.start_date);
  if (!sd) return null;
  return new Date(`${sd}T00:00:00+07:00`);
}

export function effectivePromoValidUntil(row) {
  if (!row) return null;
  if (row.promo_valid_until) return new Date(row.promo_valid_until);
  const ed = pgDateCellToYmdBangkok(row.end_date);
  if (!ed) return null;
  return new Date(`${ed}T23:59:59.999+07:00`);
}

export function getEffectivePromoWindow(row) {
  return { from: effectivePromoValidFrom(row), until: effectivePromoValidUntil(row) };
}

function normAllowedJobCategories(row) {
  const a = row?.allowed_job_categories;
  if (!a || !Array.isArray(a) || a.length === 0) return null;
  const out = a.map((s) => String(s || '').trim()).filter(Boolean);
  return out.length ? out : null;
}

function parseAllowedCategoriesFromBody(body) {
  if (body?.allowedJobCategories === undefined) return undefined;
  const raw = body.allowedJobCategories;
  if (raw == null) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  const out = arr.map((s) => String(s || '').trim()).filter(Boolean);
  return out.length ? out : null;
}

function parsePromoTs(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ดึงค่าวันเริ่ม/สิ้นสุดจาก body — รองรับชื่อฟิลด์หลายแบบ (client เก่าหรือ convention คนละชุด)
 * @returns {unknown|undefined} undefined = key ที่รู้จักไม่ได้ถูกส่งมาเลย — PATCH เก็บค่าของเก่า
 */
function pickBannerBodyDate(body, which) {
  if (!body || typeof body !== 'object') return undefined;
  const keys =
    which === 'start'
      ? [
        'startDate',
        'start_date',
        'bannerStartDate',
        'startDisplayDate',
        'displayStartDate',
      ]
      : [
        'endDate',
        'end_date',
        'bannerEndDate',
        'endDisplayDate',
        'displayEndDate',
      ];
  for (const k of keys) {
    if (body[k] !== undefined) return body[k];
  }
  return undefined;
}

/**
 * แปลงค่าจากแอดมิน (เช่น DD/MM/YYYY จาก date picker) เป็น YYYY-MM-DD สำหรับคอลัมน์ DATE
 * ถ้าไม่ parse ได้คืน null — ป้องกัน PATCH/INSERT ล้มเพราะ PG ไม่รับรูปแบบวันที่
 * รองรับปี พ.ศ. (ประมาณ 2400–2700 → ค.ศ. ลบ 543) เพื่อไม่ให้บันทึกเป็น NULL เมื่อปีจาก UI เป็นประเทศไทย
 */
function normalizeBannerDateForPg(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return pgDateCellToYmdBangkok(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  /** YYYY-MM-DD หรือ ISO datetime */
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  /** YYYY/MM/DD */
  const ymdSlash = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdSlash) {
    const y = parseInt(ymdSlash[1], 10);
    const month = parseInt(ymdSlash[2], 10);
    const day = parseInt(ymdSlash[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && y >= 1970 && y <= 2100) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  /** DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY — ปี ≥ 2400 ถือว่าเป็น พ.ศ. */
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year >= 2400 && year <= 2700) year -= 543;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1970 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const ymd = pgDateCellToYmdBangkok(parsed);
    return ymd;
  }
  return null;
}

function normSlideHeightFromRow(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase();
  if (s === 'hero' || s === 'strip' || s === 'portrait') return s;
  return null;
}

/** PATCH/POST: undefined = ไม่เปลี่ยน, null = เคลียร์คอลัมน์ — รองรับ slide_height (snake) */
function parseSlideHeightFromBody(body) {
  if (!body) return undefined;
  const raw = body.slideHeight !== undefined ? body.slideHeight : body.slide_height;
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const s = String(raw)
    .trim()
    .toLowerCase();
  if (s === 'hero' || s === 'strip' || s === 'portrait') return s;
  const err = new Error('VALIDATION: slideHeight ต้องเป็น hero | strip | portrait');
  err.code = 'VALIDATION';
  throw err;
}

function rowToApi(row) {
  if (!row) return null;
  const startDate = pgDateCellToYmdBangkok(row.start_date);
  const endDate = pgDateCellToYmdBangkok(row.end_date);
  const mode = normDiscountMode(row);
  const pct =
    row.discount_percent != null ? Math.max(0, Math.min(100, parseFloat(row.discount_percent))) : null;
  const minTop =
    row.min_cumulative_topup_thb != null
      ? Math.max(0, parseFloat(row.min_cumulative_topup_thb) || 0)
      : 0;
  const effFrom = effectivePromoValidFrom(row);
  const effUntil = effectivePromoValidUntil(row);
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    actionUrl: row.action_url || '',
    order: parseInt(row.sort_order, 10) || 0,
    startDate,
    endDate,
    isActive: row.is_active !== false,
    clicks: parseInt(row.clicks, 10) || 0,
    sheetOpens: parseInt(row.sheet_opens, 10) || 0,
    claims: parseInt(row.claims, 10) || 0,
    /** null = ใช้ค่า default จาก remote / บริบทหน้า */
    slideHeight: normSlideHeightFromRow(row.slide_height),
    promoCode: row.promo_code ? String(row.promo_code).trim().toUpperCase() : null,
    discountMaxBaht:
      row.discount_max_baht != null ? Math.max(0, parseFloat(row.discount_max_baht)) : null,
    discountDescription: row.discount_description || null,
    discountMode: mode,
    discountPercent: mode === 'percent' ? pct : null,
    minCumulativeTopupThb: minTop,
    firstPaidJobOnly: row.first_paid_job_only === true,
    promoValidFrom: effFrom ? effFrom.toISOString() : null,
    promoValidUntil: effUntil ? effUntil.toISOString() : null,
    allowedJobCategories: normAllowedJobCategories(row),
    /** false = ระงับรับ/ใช้โค้ด — แบนเนอร์ยังแสดงเป็นโฆษณาได้ */
    promoClaimsEnabled: row.promo_claims_enabled !== false,
    /** หน้าที่แสดง: home | welcome | job_detail — null = ทุกหน้า */
    placements: normPlacementsArray(row.placements),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * @param {object} body
 * @param {object|null} existingRow
 */
function validatePromoRules(body, existingRow) {
  const promoCode = body.promoCode !== undefined ? body.promoCode : existingRow?.promo_code;
  const hasPromo = !!(promoCode && String(promoCode).trim());
  if (!hasPromo) return;

  const mode =
    body.discountMode !== undefined
      ? body.discountMode === 'percent'
        ? 'percent'
        : 'fixed_baht'
      : normDiscountMode(existingRow || {});

  const maxBRaw =
    body.discountMaxBaht !== undefined ? body.discountMaxBaht : existingRow?.discount_max_baht;
  const maxB = maxBRaw != null ? Math.max(0, parseFloat(maxBRaw)) : null;

  const pctRaw =
    body.discountPercent !== undefined ? body.discountPercent : existingRow?.discount_percent;
  const pct = pctRaw != null ? parseFloat(pctRaw) : null;

  if (mode === 'percent') {
    if (!(pct > 0 && pct <= 100)) {
      const err = new Error('VALIDATION: โหมดเปอร์เซ็นต์ต้องระบุ discountPercent ระหว่าง 1–100');
      err.code = 'VALIDATION';
      throw err;
    }
    if (!(maxB > 0)) {
      const err = new Error('VALIDATION: ต้องระบุวงเงินเพดานส่วนลด (บาท) สำหรับโหมด %');
      err.code = 'VALIDATION';
      throw err;
    }
  } else if (!(maxB > 0)) {
    const err = new Error('VALIDATION: ต้องระบุวงเงินส่วนลดสูงสุด (บาท)');
    err.code = 'VALIDATION';
    throw err;
  }
}

/**
 * วันที่ปัจจุบันแบบ YYYY-MM-DD ในเขต Asia/Bangkok — ใช้กรองแบนเนอร์ public ให้สอดคล้องกับ start_date/end_date
 * (เดิมใช้ UTC จาก toISOString() ทำให้ช่วงเช้า–ดึกของไทย "วันนี้" ไม่ตรงกับ DB)
 */
export function todayDateYmdBangkok() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (y && m && d) return `${y}-${m}-${d}`;
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listHomeBannersPublic(pool) {
  const r = await pool.query(`SELECT * FROM home_banners ORDER BY sort_order ASC, created_at ASC`);
  return (r.rows || []).map(rowToApi);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listHomeBannersAdmin(pool) {
  return listHomeBannersPublic(pool);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function getBannerByPromoCode(pool, code) {
  const c = String(code || '')
    .trim()
    .toUpperCase();
  if (!c) return null;
  const r = await pool.query(
    `SELECT * FROM home_banners WHERE UPPER(TRIM(promo_code)) = $1 AND is_active = TRUE LIMIT 1`,
    [c]
  );
  return rowToApi(r.rows?.[0]);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function createHomeBanner(pool, body) {
  const {
    title,
    imageUrl,
    actionUrl,
    order,
    isActive,
    promoCode,
    discountMaxBaht,
    discountDescription,
    discountMode,
    discountPercent,
    minCumulativeTopupThb,
    firstPaidJobOnly,
    promoValidFrom,
    promoValidUntil,
    promoClaimsEnabled,
  } = body || {};
  validatePromoRules(body, null);
  const id = `B${Date.now()}`;
  const mode = discountMode === 'percent' ? 'percent' : 'fixed_baht';
  const pct =
    discountPercent != null && discountPercent !== ''
      ? Math.max(0, Math.min(100, parseFloat(discountPercent)))
      : null;
  const minTop =
    minCumulativeTopupThb != null && minCumulativeTopupThb !== ''
      ? Math.max(0, parseFloat(minCumulativeTopupThb))
      : 0;
  const fpj = firstPaidJobOnly === true || firstPaidJobOnly === 'true';
  const pvFrom = parsePromoTs(promoValidFrom);
  const pvUntil = parsePromoTs(promoValidUntil);
  const allowedCats = parseAllowedCategoriesFromBody(body);
  const pce =
    promoClaimsEnabled === false || promoClaimsEnabled === 'false' ? false : true;
  const placementsParsed = parsePlacementsFromBody(body);
  const placementsDb = placementsParsed === undefined ? null : placementsParsed;
  const slideH = parseSlideHeightFromBody(body);

  const startDateNorm = normalizeBannerDateForPg(pickBannerBodyDate(body, 'start'));
  const endDateNorm = normalizeBannerDateForPg(pickBannerBodyDate(body, 'end'));

  await pool.query(
    `INSERT INTO home_banners (
       id, title, image_url, action_url, sort_order, start_date, end_date, is_active,
       promo_code, discount_max_baht, discount_description,
       discount_mode, discount_percent, min_cumulative_topup_thb, first_paid_job_only,
       promo_valid_from, promo_valid_until, allowed_job_categories,
       promo_claims_enabled,
       placements,
       slide_height,
       updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())`,
    [
      id,
      String(title),
      String(imageUrl),
      actionUrl != null ? String(actionUrl) : '',
      parseInt(order, 10) || 0,
      startDateNorm,
      endDateNorm,
      isActive !== false,
      promoCode ? String(promoCode).trim().toUpperCase() : null,
      discountMaxBaht != null ? Math.max(0, parseFloat(discountMaxBaht)) : null,
      discountDescription ? String(discountDescription) : null,
      mode,
      mode === 'percent' ? pct : null,
      minTop,
      fpj,
      pvFrom,
      pvUntil,
      allowedCats,
      pce,
      placementsDb,
      slideH === undefined ? null : slideH,
    ]
  );
  const row = (await pool.query(`SELECT * FROM home_banners WHERE id = $1`, [id])).rows[0];
  return rowToApi(row);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function updateHomeBanner(pool, id, body) {
  const cur = await pool.query(`SELECT * FROM home_banners WHERE id = $1`, [id]);
  if (!cur.rows?.[0]) return null;
  const b = body || {};
  validatePromoRules(
    {
      promoCode: b.promoCode !== undefined ? b.promoCode : cur.rows[0].promo_code,
      discountMode: b.discountMode,
      discountMaxBaht: b.discountMaxBaht,
      discountPercent: b.discountPercent,
    },
    cur.rows[0]
  );

  const title = b.title !== undefined ? String(b.title) : cur.rows[0].title;
  const imageUrl = b.imageUrl !== undefined ? String(b.imageUrl) : cur.rows[0].image_url;
  const actionUrl = b.actionUrl !== undefined ? String(b.actionUrl) : cur.rows[0].action_url;
  const sortOrder =
    b.order !== undefined ? parseInt(b.order, 10) || 0 : cur.rows[0].sort_order;
  const rawStartPatch = pickBannerBodyDate(b, 'start');
  const rawEndPatch = pickBannerBodyDate(b, 'end');
  const hasStartDate = rawStartPatch !== undefined;
  const startDate = hasStartDate ? normalizeBannerDateForPg(rawStartPatch) : cur.rows[0].start_date;
  const hasEndDate = rawEndPatch !== undefined;
  const endDate = hasEndDate ? normalizeBannerDateForPg(rawEndPatch) : cur.rows[0].end_date;
  const isActive = b.isActive !== undefined ? b.isActive !== false : cur.rows[0].is_active;
  let promoCode = cur.rows[0].promo_code;
  if (b.promoCode !== undefined) {
    promoCode = b.promoCode ? String(b.promoCode).trim().toUpperCase() : null;
  }
  let discountMaxBaht = cur.rows[0].discount_max_baht;
  if (b.discountMaxBaht !== undefined) {
    discountMaxBaht = b.discountMaxBaht != null ? Math.max(0, parseFloat(b.discountMaxBaht)) : null;
  }
  let discountDescription = cur.rows[0].discount_description;
  if (b.discountDescription !== undefined) {
    discountDescription = b.discountDescription ? String(b.discountDescription) : null;
  }

  let discountMode = normDiscountMode(cur.rows[0]);
  if (b.discountMode !== undefined) {
    discountMode = b.discountMode === 'percent' ? 'percent' : 'fixed_baht';
  }
  let discountPercent = cur.rows[0].discount_percent;
  if (b.discountPercent !== undefined) {
    discountPercent =
      b.discountPercent != null && b.discountPercent !== ''
        ? Math.max(0, Math.min(100, parseFloat(b.discountPercent)))
        : null;
  }
  if (discountMode === 'fixed_baht') {
    discountPercent = null;
  }

  let minCumulativeTopupThb = cur.rows[0].min_cumulative_topup_thb ?? 0;
  if (b.minCumulativeTopupThb !== undefined) {
    minCumulativeTopupThb =
      b.minCumulativeTopupThb != null && b.minCumulativeTopupThb !== ''
        ? Math.max(0, parseFloat(b.minCumulativeTopupThb))
        : 0;
  }

  let firstPaidJobOnly = cur.rows[0].first_paid_job_only === true;
  if (b.firstPaidJobOnly !== undefined) {
    firstPaidJobOnly = b.firstPaidJobOnly === true || b.firstPaidJobOnly === 'true';
  }

  let promoValidFrom = cur.rows[0].promo_valid_from;
  if (b.promoValidFrom !== undefined) {
    promoValidFrom = b.promoValidFrom == null || b.promoValidFrom === '' ? null : parsePromoTs(b.promoValidFrom);
  }
  let promoValidUntil = cur.rows[0].promo_valid_until;
  if (b.promoValidUntil !== undefined) {
    promoValidUntil = b.promoValidUntil == null || b.promoValidUntil === '' ? null : parsePromoTs(b.promoValidUntil);
  }

  let allowedJobCategories = cur.rows[0].allowed_job_categories;
  if (b.allowedJobCategories !== undefined) {
    allowedJobCategories = parseAllowedCategoriesFromBody(b);
  }

  let promoClaimsEnabled = cur.rows[0].promo_claims_enabled !== false;
  if (b.promoClaimsEnabled !== undefined) {
    promoClaimsEnabled = b.promoClaimsEnabled !== false && b.promoClaimsEnabled !== 'false';
  }

  let placementsVal = cur.rows[0].placements;
  const placementsParsedPatch = parsePlacementsFromBody(b);
  if (placementsParsedPatch !== undefined) {
    placementsVal = placementsParsedPatch;
  }

  let slideHeightVal = cur.rows[0].slide_height;
  const slidePatch = parseSlideHeightFromBody(b);
  if (slidePatch !== undefined) {
    slideHeightVal = slidePatch;
  }

  await pool.query(
    `UPDATE home_banners SET
       title = $2, image_url = $3, action_url = $4, sort_order = $5,
       start_date = $6, end_date = $7, is_active = $8,
       promo_code = $9, discount_max_baht = $10, discount_description = $11,
       discount_mode = $12, discount_percent = $13, min_cumulative_topup_thb = $14, first_paid_job_only = $15,
       promo_valid_from = $16, promo_valid_until = $17, allowed_job_categories = $18,
       promo_claims_enabled = $19,
       placements = $20,
       slide_height = $21,
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      title,
      imageUrl,
      actionUrl,
      sortOrder,
      startDate,
      endDate,
      isActive,
      promoCode,
      discountMaxBaht,
      discountDescription,
      discountMode,
      discountPercent,
      minCumulativeTopupThb,
      firstPaidJobOnly,
      promoValidFrom,
      promoValidUntil,
      allowedJobCategories,
      promoClaimsEnabled,
      placementsVal,
      slideHeightVal,
    ]
  );
  const row = (await pool.query(`SELECT * FROM home_banners WHERE id = $1`, [id])).rows[0];
  return rowToApi(row);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function deleteHomeBanner(pool, id) {
  const r = await pool.query(`DELETE FROM home_banners WHERE id = $1 RETURNING id`, [id]);
  return (r.rowCount || 0) > 0;
}

/**
 * นับ engagement แบนเนอร์แยก sheet_open / claim
 * @param {import('pg').Pool} pool
 * @param {'sheet_open'|'claim'} kind
 */
export async function incrementHomeBannerEvent(pool, bannerId, kind) {
  const id = String(bannerId || '').trim();
  const k = String(kind || '').trim();
  if (!id) return;
  if (k !== 'sheet_open' && k !== 'claim') return;
  const runUpdate = () =>
    pool.query(
      `UPDATE home_banners SET
         sheet_opens = COALESCE(sheet_opens, 0) + CASE WHEN $2::text = 'sheet_open' THEN 1 ELSE 0 END,
         claims = COALESCE(claims, 0) + CASE WHEN $2::text = 'claim' THEN 1 ELSE 0 END,
         updated_at = NOW()
       WHERE id = $1`,
      [id, k],
    );
  try {
    await runUpdate();
  } catch (e) {
    // Self-heal: บางเครื่องยังไม่มี migration 183 -> เพิ่มคอลัมน์แล้วลองใหม่
    if (e && e.code === '42703') {
      await pool.query(
        `ALTER TABLE home_banners
           ADD COLUMN IF NOT EXISTS sheet_opens INTEGER NOT NULL DEFAULT 0,
           ADD COLUMN IF NOT EXISTS claims INTEGER NOT NULL DEFAULT 0`
      );
      await runUpdate();
      return;
    }
    throw e;
  }
}
