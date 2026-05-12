/**
 * รหัสประเภทรถ (vehicle_type) — ต้องสอดคล้องกับ dropdown KYC ใน Play Console / Admin
 * @see backend/server.js ฟิลด์ dynamic KYC — options: motorcycle, sedan, pickup, truck_*
 *
 * หมายเหตุ: สามล้อ/ตุ๊กตุ๊ก อาจไม่อยู่ใน list นี้โดยตรง — ระบบจำแนกจากข้อความใน vehicle_type
 * (เช่น "tricycle", "tuktuk", "สามล้อ") ตาม logic ใน classifyVehicle ของ PATCH profile
 */

/** ลำดับตาม dropdown KYC (ค่าที่บันทึกลง users.vehicle_type) */
export const KYC_VEHICLE_TYPE_IDS = [
  'motorcycle',
  'sedan',
  'pickup',
  'truck_6wheeler',
  'truck_10wheeler',
  'truck_18wheeler',
];

/** ป้ายกำกับสั้นๆ สำหรับ log / admin (ไม่บังคับใช้ใน DB) */
export const KYC_VEHICLE_TYPE_LABELS_TH = {
  motorcycle: 'รถจักรยานยนต์',
  sedan: 'รถเก๋ง / Sedan',
  pickup: 'รถกระบะ',
  truck_6wheeler: 'รถบรรทุก 6 ล้อ',
  truck_10wheeler: 'รถบรรทุก 10 ล้อ',
  truck_18wheeler: 'รถบรรทุก 18 ล้อ',
};

const FOUR_WHEEL = new Set(['sedan', 'pickup', 'truck_6wheeler', 'truck_10wheeler', 'truck_18wheeler']);

export function isKycVehicleTypeRegistered(id) {
  const v = (id || '').toString().trim().toLowerCase();
  return KYC_VEHICLE_TYPE_IDS.includes(v);
}

export function isFourWheelKycVehicleType(id) {
  const v = (id || '').toString().trim().toLowerCase();
  return FOUR_WHEEL.has(v);
}

export function isMotorcycleKycVehicleType(id) {
  return (id || '').toString().trim().toLowerCase() === 'motorcycle';
}

/**
 * แปลงค่าจาก DB เป็นกลุ่มสำหรับ matching แข็ง
 * @returns {'motorcycle'|'tricycle'|'four_wheel'|'unknown'}
 */
export function inferVehicleFamilyFromStoredType(raw) {
  const v = (raw || '').toString().trim().toLowerCase();
  if (!v) return 'unknown';
  if (v === 'motorcycle' || v.includes('motorcycle')) return 'motorcycle';
  if (v.includes('tricycle') || v.includes('tuktuk') || v.includes('สามล้อ') || v.includes('tuk')) return 'tricycle';
  if (
    FOUR_WHEEL.has(v) ||
    v.includes('truck') ||
    v.includes('sedan') ||
    v.includes('pickup') ||
    v.includes('van') ||
    v.includes('suv') ||
    v.includes('mpv') ||
    v.includes('minivan')
  ) {
    return 'four_wheel';
  }
  return 'unknown';
}
