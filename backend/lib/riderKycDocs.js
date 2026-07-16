/**
 * Rider OS KYC — required document set for delivery partners.
 * vehicles_json[] may include vehicle_photo_{front,back,left,right}_url
 */

export const RIDER_VEHICLE_PHOTO_KEYS = [
  'vehicle_photo_front_url',
  'vehicle_photo_back_url',
  'vehicle_photo_left_url',
  'vehicle_photo_right_url',
];

export const RIDER_VEHICLE_PHOTO_LABELS = {
  vehicle_photo_front_url: 'ด้านหน้า',
  vehicle_photo_back_url: 'ด้านหลัง',
  vehicle_photo_left_url: 'ด้านซ้าย',
  vehicle_photo_right_url: 'ด้านขวา',
};

export function parseRiderVehiclesJson(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function riderVehicleDocStatus(vehicle = {}) {
  const reg = !!String(vehicle.registration_book_photo_url || '').trim();
  const sides = RIDER_VEHICLE_PHOTO_KEYS.map((k) => !!String(vehicle[k] || '').trim());
  return {
    registration_book: reg,
    vehicle_photos: sides,
    all_vehicle_photos: sides.every(Boolean),
    complete: reg && sides.every(Boolean),
  };
}

/**
 * Validate rider KYC payload (URLs already trusted by caller).
 * @returns {{ ok: true } | { ok: false, error: string, missing?: string[] }}
 */
export function validateRiderKycDocuments(input = {}) {
  const missing = [];
  const idFront = String(input.id_card_front_url || input.idCardFrontUrl || '').trim();
  const idBack = String(input.id_card_back_url || input.idCardBackUrl || '').trim();
  const selfie = String(input.selfie_photo_url || input.selfiePhotoUrl || '').trim();
  const dlFront = String(input.driving_license_front_url || input.drivingLicenseFrontUrl || '').trim();
  const dlBack = String(input.driving_license_back_url || input.drivingLicenseBackUrl || '').trim();

  if (!idFront) missing.push('id_card_front');
  if (!idBack) missing.push('id_card_back');
  if (!selfie) missing.push('selfie');
  if (!dlFront) missing.push('driving_license_front');
  if (!dlBack) missing.push('driving_license_back');

  const vehicles = parseRiderVehiclesJson(input.vehicles_json ?? input.vehiclesJson);
  const vehicle = vehicles[0] || {};
  const vstat = riderVehicleDocStatus(vehicle);
  if (!vstat.registration_book) missing.push('registration_book');
  if (!vstat.all_vehicle_photos) missing.push('vehicle_photos_4_sides');

  const wantsPublic =
    input.wants_public_transport === true ||
    input.wantsPublicTransport === true ||
    String(input.wants_public_transport || '').toLowerCase() === 'true';

  if (wantsPublic) {
    if (!String(input.yellow_plate_photo_url || input.yellowPlatePhotoUrl || '').trim()) {
      missing.push('yellow_plate');
    }
    if (!String(input.public_transport_license_front_url || input.publicTransportLicenseFrontUrl || '').trim()) {
      missing.push('public_transport_license_front');
    }
    if (!String(input.public_transport_license_back_url || input.publicTransportLicenseBackUrl || '').trim()) {
      missing.push('public_transport_license_back');
    }
  }

  if (missing.length) {
    return { ok: false, error: 'rider_kyc_incomplete', missing };
  }
  return { ok: true };
}

export const RIDER_KYC_MISSING_LABELS = {
  id_card_front: 'บัตรประชาชน (หน้า)',
  id_card_back: 'บัตรประชาชน (หลัง)',
  selfie: 'รูปถ่ายใบหน้า',
  driving_license_front: 'ใบขับขี่ (หน้า)',
  driving_license_back: 'ใบขับขี่ (หลัง)',
  registration_book: 'เล่มทะเบียนรถ / สำเนาทะเบียน',
  vehicle_photos_4_sides: 'ภาพรถครบ 4 ด้าน',
  yellow_plate: 'ใบอนุญาตป้ายเหลือง',
  public_transport_license_front: 'ใบขับขี่สาธารณะ (หน้า)',
  public_transport_license_back: 'ใบขับขี่สาธารณะ (หลัง)',
};
