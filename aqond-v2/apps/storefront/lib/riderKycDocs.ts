/** Rider OS KYC — document keys and Thai labels (storefront). */

export const RIDER_VEHICLE_PHOTO_KEYS = [
  'vehicle_photo_front_url',
  'vehicle_photo_back_url',
  'vehicle_photo_left_url',
  'vehicle_photo_right_url',
] as const;

export type RiderVehiclePhotoKey = (typeof RIDER_VEHICLE_PHOTO_KEYS)[number];

export const RIDER_VEHICLE_PHOTO_LABELS: Record<RiderVehiclePhotoKey, string> = {
  vehicle_photo_front_url: 'ด้านหน้า',
  vehicle_photo_back_url: 'ด้านหลัง',
  vehicle_photo_left_url: 'ด้านซ้าย',
  vehicle_photo_right_url: 'ด้านขวา',
};

export type RiderKycForm = {
  id_card_front_url: string;
  id_card_back_url: string;
  selfie_photo_url: string;
  driving_license_front_url: string;
  driving_license_back_url: string;
  registration_book_photo_url: string;
  vehicle_photo_front_url: string;
  vehicle_photo_back_url: string;
  vehicle_photo_left_url: string;
  vehicle_photo_right_url: string;
  id_card_expiry_date: string;
  driver_license_expiry: string;
  wants_public_transport: boolean;
  yellow_plate_photo_url: string;
  public_transport_license_front_url: string;
  public_transport_license_back_url: string;
};

export const EMPTY_RIDER_KYC_FORM: RiderKycForm = {
  id_card_front_url: '',
  id_card_back_url: '',
  selfie_photo_url: '',
  driving_license_front_url: '',
  driving_license_back_url: '',
  registration_book_photo_url: '',
  vehicle_photo_front_url: '',
  vehicle_photo_back_url: '',
  vehicle_photo_left_url: '',
  vehicle_photo_right_url: '',
  wants_public_transport: false,
  yellow_plate_photo_url: '',
  public_transport_license_front_url: '',
  public_transport_license_back_url: '',
  id_card_expiry_date: '',
  driver_license_expiry: '',
};

export type RiderKycStep = {
  id: string;
  title: string;
  hint: string;
  short?: string;
};

export const RIDER_KYC_STEPS: RiderKycStep[] = [
  { id: 'id', title: 'บัตรประชาชน', hint: 'ถ่ายให้เห็นข้อความชัด — หน้าและหลัง', short: 'บัตร ปชช.' },
  { id: 'selfie', title: 'รูปใบหน้า', hint: 'จับใบหน้าอัจฉริยะผ่านกล้อง — ใช้แสดงโปรไฟล์ให้ลูกค้าจำหน้าได้', short: 'Selfie' },
  { id: 'license', title: 'ใบขับขี่', hint: 'ใบขับขี่ที่ใช้ขับรถจริง — หน้าและหลัง', short: 'ใบขับขี่' },
  { id: 'vehicle', title: 'รถและทะเบียน', hint: 'เล่มทะเบียน/สำเนา + รูปรถครบ 4 ด้าน', short: 'รถ 4 ด้าน' },
  { id: 'public', title: 'รับผู้โดยสาร (ถ้ามี)', hint: 'ป้ายเหลือง + ใบอนุญาตขนส่งผู้โดยสาร — ไม่บังคับ', short: 'ป้ายเหลือง' },
];

export function validateRiderKycForm(form: RiderKycForm): string[] {
  const missing: string[] = [];
  if (!form.id_card_front_url) missing.push('บัตรประชาชน (หน้า)');
  if (!form.id_card_back_url) missing.push('บัตรประชาชน (หลัง)');
  if (!form.selfie_photo_url) missing.push('รูปถ่ายใบหน้า');
  if (!form.driving_license_front_url) missing.push('ใบขับขี่ (หน้า)');
  if (!form.driving_license_back_url) missing.push('ใบขับขี่ (หลัง)');
  if (!form.registration_book_photo_url) missing.push('เล่มทะเบียนรถ / สำเนาทะเบียน');
  for (const k of RIDER_VEHICLE_PHOTO_KEYS) {
    if (!form[k]) missing.push(`ภาพรถ — ${RIDER_VEHICLE_PHOTO_LABELS[k]}`);
  }
  if (form.wants_public_transport) {
    if (!form.yellow_plate_photo_url) missing.push('ใบอนุญาตป้ายเหลือง');
    if (!form.public_transport_license_front_url) missing.push('ใบขับขี่สาธารณะ (หน้า)');
    if (!form.public_transport_license_back_url) missing.push('ใบขับขี่สาธารณะ (หลัง)');
  }
  return missing;
}

export function riderKycFormToPayload(form: RiderKycForm, profile?: { plate?: string; vehicle?: string }) {
  return {
    idCardFrontUrl: form.id_card_front_url,
    idCardBackUrl: form.id_card_back_url,
    selfiePhotoUrl: form.selfie_photo_url,
    drivingLicenseFrontUrl: form.driving_license_front_url,
    drivingLicenseBackUrl: form.driving_license_back_url,
    wantsPublicTransport: form.wants_public_transport,
    yellowPlatePhotoUrl: form.yellow_plate_photo_url || undefined,
    publicTransportLicenseFrontUrl: form.public_transport_license_front_url || undefined,
    publicTransportLicenseBackUrl: form.public_transport_license_back_url || undefined,
    idCardExpiryDate: form.id_card_expiry_date || undefined,
    driverLicenseExpiry: form.driver_license_expiry || undefined,
    vehiclesJson: JSON.stringify([
      {
        license_plate: profile?.plate || '',
        vehicle_type: profile?.vehicle || 'motorcycle',
        registration_book_photo_url: form.registration_book_photo_url,
        vehicle_photo_front_url: form.vehicle_photo_front_url,
        vehicle_photo_back_url: form.vehicle_photo_back_url,
        vehicle_photo_left_url: form.vehicle_photo_left_url,
        vehicle_photo_right_url: form.vehicle_photo_right_url,
        channel: 'aqond_delivery',
        source: 'rider_os_web',
      },
    ]),
  };
}
