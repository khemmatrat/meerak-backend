/**
 * Phase 1.2–1.5 — Hard constraints สำหรับการจับคู่ (ขยายกฎหมวดใหม่ได้ทีละ registry)
 * - Transport: คลาสประเภทรถ/รถจักรยานยนต์/สามล้อ ต้องตรงกับที่ลูกค้าสั่ง (ไม่ส่ง Wave ไปรับ Premium 4 ที่นั่ง)
 * - Cleaning: หมวดแม่บ้าน — ต้องมีทักษะ/สายงานที่เกี่ยวข้อง
 * - Marine: เกรดเรือ job vs provider
 * - Capacity: จำกัดจำนวนงานคู่ขนานจาก env
 * - เวลา: ใช้ช่วง slot จาก datetime + duration_hours (ผ่าน conflictValidator)
 *
 * รหัส vehicle_type มาตรฐาน KYC: ดู matchingVehicleTypes.js (KYC_VEHICLE_TYPE_IDS)
 */

import { inferVehicleFamilyFromStoredType } from './matchingVehicleTypes.js';

const CAR_JOB_VEHICLE_IDS = new Set(['standard', 'saver', 'premium', 'luxury']);
const MOTO_JOB_VEHICLE_IDS = new Set(['motorcycle_standard', 'motorcycle_saver', 'motorcycle_premium']);
const TRI_JOB_VEHICLE_IDS = new Set(['tricycle_standard', 'tricycle_premium']);

function parsePaymentDetails(jobRow) {
  if (!jobRow) return {};
  const pd = jobRow.payment_details;
  if (pd == null) return {};
  if (typeof pd === 'string') {
    try {
      return JSON.parse(pd || '{}');
    } catch {
      return {};
    }
  }
  if (typeof pd === 'object') return { ...pd };
  return {};
}

/**
 * ดึง vehicle id ที่ลูกค้าสั่ง (Transport Hub เก็บใน payment_details.transport_vehicle)
 * @param {object} jobRow
 * @param {{ transport_vehicle?: string }} [bodyHints] — จาก POST /api/jobs/match กรณียังไม่มี job ใน DB
 */
export function getJobTransportVehicleId(jobRow, bodyHints) {
  const fromBody = (bodyHints?.transport_vehicle || '').toString().trim().toLowerCase();
  if (fromBody) return fromBody;
  const pd = parsePaymentDetails(jobRow);
  const v = (pd.transport_vehicle || '').toString().trim().toLowerCase();
  if (v) return v;
  return null;
}

/**
 * กลุ่มประเภทงานที่ลูกค้าเลือก (สำหรับ transport)
 */
export function getTransportJobFamily(vehicleId) {
  const id = (vehicleId || 'standard').toString().trim().toLowerCase();
  if (CAR_JOB_VEHICLE_IDS.has(id)) return 'car';
  if (MOTO_JOB_VEHICLE_IDS.has(id)) return 'motorcycle';
  if (TRI_JOB_VEHICLE_IDS.has(id)) return 'tricycle';
  return 'car';
}

/**
 * กลุ่มประเภทรถที่ provider มีจริง (จาก vehicle_type + vehicle_category)
 * vehicle_type ใช้รหัสตาม KYC + รองรับข้อความพิเศษ (สามล้อ) — ดู inferVehicleFamilyFromStoredType
 */
export function classifyProviderTransportCapability(providerRow) {
  const raw = providerRow?.vehicle_type;
  const vt = (raw || '').toString().trim();
  const tier =
    (providerRow?.vehicle_category || 'standard').toString().toLowerCase() === 'premium' ? 'premium' : 'standard';
  const fam = inferVehicleFamilyFromStoredType(raw);
  if (!vt) return { family: 'unknown', tier: 'standard', vehicle_type: '' };
  if (fam === 'motorcycle') return { family: 'motorcycle', tier, vehicle_type: vt };
  if (fam === 'tricycle') return { family: 'tricycle', tier, vehicle_type: vt };
  if (fam === 'four_wheel') return { family: 'car', tier, vehicle_type: vt };
  return { family: 'unknown', tier: 'standard', vehicle_type: vt };
}

/**
 * job ต้องการ tier premium หรือไม่ (รถเก๋ง/มอเตอร์ไซค์/สามล้อ)
 */
function jobVehicleNeedsPremium(jobVehicleId) {
  const id = (jobVehicleId || '').toString().trim().toLowerCase();
  return id === 'premium' || id === 'luxury' || id === 'motorcycle_premium' || id === 'tricycle_premium';
}

/**
 * Transport: hard match — ถ้าไม่ผ่าน ไม่ควรนำไปคิดคะแนน
 */
export function evaluateTransportHardRule(jobCategory, jobVehicleId, providerRow) {
  const cat = (jobCategory || '').toLowerCase().trim();
  if (cat !== 'driver') return { ok: true };

  const reqId = (jobVehicleId || 'standard').toString().trim().toLowerCase();
  const jobFamily = getTransportJobFamily(reqId);
  const cap = classifyProviderTransportCapability(providerRow);

  if (cap.family === 'unknown') {
    return {
      ok: false,
      code: 'transport_vehicle_unregistered',
      label_th: 'ผู้ให้บริการยังไม่ระบุประเภทรถยนต์ในโปรไฟล์',
    };
  }

  if (jobFamily === 'car' && cap.family !== 'car') {
    return {
      ok: false,
      code: 'transport_class_mismatch',
      label_th: 'งานนี้ต้องใช้รถสี่ล้อ ไม่ตรงกับประเภทรถของผู้ให้บริการ',
    };
  }
  if ((jobFamily === 'motorcycle' || jobFamily === 'tricycle') && cap.family !== jobFamily) {
    return {
      ok: false,
      code: 'transport_class_mismatch',
      label_th:
        jobFamily === 'motorcycle'
          ? 'งานนี้ต้องใช้รถจักรยานยนต์ ไม่ตรงกับประเภทรถของผู้ให้บริการ'
          : 'งานนี้ต้องใช้รถสามล้อ/ตุ๊กตุ๊ก ไม่ตรงกับประเภทรถของผู้ให้บริการ',
    };
  }

  if (jobVehicleNeedsPremium(reqId) && cap.tier !== 'premium') {
    return {
      ok: false,
      code: 'transport_premium_required',
      label_th: 'งานนี้ระบุระดับ Premium ต้องใช้รถ/ยี่ห้อที่ระบบจัดเป็น Premium',
    };
  }

  return { ok: true };
}

const CLEANING_CATEGORY_KEYS = ['cleaning', 'ac_cleaning', 'housekeeping'];

function skillsList(providerRow) {
  try {
    const sj = providerRow?.skills_json;
    return Array.isArray(sj) ? sj : sj ? JSON.parse(sj) : [];
  } catch {
    return [];
  }
}

/** งานล้างแอร์ — ต้องมีสายแอร์/เทคนิคแอร์ ไม่ใช่แค่แม่บ้านทั่วไป */
function acCleaningRelatedProvider(providerRow) {
  const exp = (providerRow?.expert_category || '').toLowerCase();
  if (exp.includes('ac_cleaning') || exp.includes('ac_repair') || exp.includes('air')) return true;
  const skills = skillsList(providerRow);
  return skills.some((s) => {
    const sc = (s?.skill_category || '').toLowerCase();
    const sn = (s?.skill_name || '').toLowerCase();
    return (
      sc.includes('ac_clean') ||
      sc.includes('air_cond') ||
      sn.includes('แอร์') ||
      sn.includes('ล้างแอร์') ||
      sn.includes('air cond') ||
      sn.includes('a/c')
    );
  });
}

/** งานแม่บ้านทั่วไป — ทำความสะอาด / บ้าน */
function houseCleaningRelatedProvider(providerRow) {
  const exp = (providerRow?.expert_category || '').toLowerCase();
  if (exp.includes('housekeep') || exp.includes('maid') || exp.includes('แม่บ้าน')) return true;
  if (CLEANING_CATEGORY_KEYS.some((k) => exp.includes(k) && !exp.includes('ac_'))) return true;
  const skills = skillsList(providerRow);
  return skills.some((s) => {
    const sc = (s?.skill_category || '').toLowerCase();
    const sn = (s?.skill_name || '').toLowerCase();
    return (
      sc.includes('clean') ||
      sn.includes('clean') ||
      sc.includes('housekeep') ||
      sn.includes('housekeep') ||
      sc.includes('maid') ||
      sn.includes('แม่บ้าน')
    );
  });
}

export function evaluateCleaningHardRule(jobCategory, providerRow) {
  const jc = (jobCategory || '').toLowerCase().trim();
  if (!jc.includes('cleaning') && !jc.includes('ac_cleaning')) return { ok: true };
  if (jc.includes('ac_cleaning')) {
    if (acCleaningRelatedProvider(providerRow)) return { ok: true };
    return {
      ok: false,
      code: 'ac_cleaning_skill_required',
      label_th: 'งานล้างแอร์ — ต้องมีทักษะ/สายงานที่เกี่ยวกับแอร์ในโปรไฟล์',
    };
  }
  if (houseCleaningRelatedProvider(providerRow)) return { ok: true };
  return {
    ok: false,
    code: 'cleaning_skill_required',
    label_th: 'งานแม่บ้าน/ทำความสะอาด — ต้องมีทักษะหรือสายงานแม่บ้านในโปรไฟล์',
  };
}

export function evaluateMarineBoatHardRule(jobRow, providerRow) {
  const cat = (jobRow?.category || '').toLowerCase().trim();
  if (cat !== 'marine') return { ok: true };
  const jg = (jobRow?.boat_grade || 'standard').toString().toLowerCase();
  const pg = (providerRow?.boat_category || 'standard').toString().toLowerCase();
  if (jg === 'premium' && pg !== 'premium') {
    return {
      ok: false,
      code: 'marine_boat_grade_mismatch',
      label_th: 'งานนี้ระบุเรือเกรด Premium — ไม่ตรงกับเกรดเรือในโปรไฟล์',
    };
  }
  return { ok: true };
}

export function getMaxConcurrentJobsForProvider() {
  const raw = parseInt(process.env.PROVIDER_MAX_CONCURRENT_JOBS || '3', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 3;
}

/**
 * @param {object} pool - pg Pool
 * @param {string[]} providerIds - uuid[]
 */
export async function loadProviderActiveJobCounts(pool, providerIds) {
  if (!providerIds?.length) return new Map();
  const r = await pool.query(
    `SELECT accepted_by::text AS pid, COUNT(*)::int AS c
     FROM jobs
     WHERE accepted_by::text = ANY($1::text[])
       AND LOWER(TRIM(COALESCE(status, ''))) = ANY(ARRAY['accepted','in_progress','waiting_for_approval','waiting_for_payment'])
     GROUP BY accepted_by`,
    [providerIds]
  );
  const map = new Map();
  for (const row of r.rows || []) {
    map.set(String(row.pid), parseInt(row.c, 10) || 0);
  }
  return map;
}

export function evaluateCapacityHardRule(activeCount, maxConcurrent) {
  if ((activeCount || 0) >= maxConcurrent) {
    return {
      ok: false,
      code: 'provider_at_capacity',
      label_th: `ผู้ให้บริการรับงานเต็มขอบเขต (${maxConcurrent} งานพร้อมกัน)`,
    };
  }
  return { ok: true };
}

/**
 * รวมกฎหมดทั้งหมดที่ใช้งานได้กับ job นี้
 * @param {object} ctx
 * @param {object|null} ctx.jobRow
 * @param {string} ctx.jobCategory
 * @param {object} ctx.providerRow
 * @param {{ transport_vehicle?: string }} [ctx.bodyHints]
 * @param {number|null} [ctx.activeJobCount]
 * @param {number} [ctx.maxConcurrent]
 */
export function evaluateAllHardRules(ctx) {
  const { jobRow, jobCategory, providerRow, bodyHints, activeJobCount, maxConcurrent } = ctx;
  const reasons = [];

  const transportVehicleId = getJobTransportVehicleId(jobRow, bodyHints);
  const catForTransport = (jobCategory || '').toLowerCase().trim();
  if (catForTransport === 'driver') {
    const tv = evaluateTransportHardRule(jobCategory, transportVehicleId || 'standard', providerRow);
    if (!tv.ok) reasons.push(tv);
  }

  const cl = evaluateCleaningHardRule(jobCategory, providerRow);
  if (!cl.ok) reasons.push(cl);

  const m = evaluateMarineBoatHardRule(jobRow, providerRow);
  if (!m.ok) reasons.push(m);

  const maxC = maxConcurrent ?? getMaxConcurrentJobsForProvider();
  if (activeJobCount != null) {
    const cap = evaluateCapacityHardRule(activeJobCount, maxC);
    if (!cap.ok) reasons.push(cap);
  }

  if (reasons.length === 0) return { ok: true, hard_fail_reasons: [] };
  return { ok: false, hard_fail_reasons: reasons, primary: reasons[0] };
}

export {
  KYC_VEHICLE_TYPE_IDS,
  KYC_VEHICLE_TYPE_LABELS_TH,
  isKycVehicleTypeRegistered,
  isFourWheelKycVehicleType,
  isMotorcycleKycVehicleType,
  inferVehicleFamilyFromStoredType,
} from './matchingVehicleTypes.js';
