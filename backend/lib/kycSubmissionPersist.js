/** Parse KYC submit body fields (multipart + JSON). */

function trimUrl(v) {
  const s = v != null ? String(v).trim() : '';
  return s || null;
}

function parseLicenseClass(raw) {
  if (Array.isArray(raw)) return JSON.stringify(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return JSON.stringify(Array.isArray(p) ? p : []);
    } catch {
      return '[]';
    }
  }
  return null;
}

function normalizeDateOnly(v) {
  if (v == null || !String(v).trim()) return null;
  const s = String(v).trim().slice(0, 32);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseKycExpiryFields(body = {}) {
  return {
    id_card_expiry_date: normalizeDateOnly(
      body.idCardExpiryDate ?? body.id_card_expiry_date ?? body.id_card_expiry,
    ),
    driver_license_expiry: normalizeDateOnly(
      body.driverLicenseExpiry ?? body.driver_license_expiry,
    ),
  };
}

export function parseKycExtendedFields(body = {}) {
  const wants =
    body.wantsPublicTransport === true ||
    body.wants_public_transport === true ||
    String(body.wantsPublicTransport || body.wants_public_transport || '').toLowerCase() === 'true';
  return {
    wants_public_transport: wants,
    yellow_plate_photo_url: trimUrl(body.yellowPlatePhotoUrl ?? body.yellow_plate_photo_url),
    public_transport_license_front_url: trimUrl(
      body.publicTransportLicenseFrontUrl ?? body.public_transport_license_front_url,
    ),
    public_transport_license_back_url: trimUrl(
      body.publicTransportLicenseBackUrl ?? body.public_transport_license_back_url,
    ),
    driver_license_number: trimUrl(body.driverLicenseNumber ?? body.driver_license_number)?.slice(0, 32) || null,
    driver_license_type: trimUrl(body.driverLicenseType ?? body.driver_license_type)?.slice(0, 32) || null,
    driver_license_class: parseLicenseClass(body.driverLicenseClass ?? body.driver_license_class),
  };
}

/** INSERT params array for kyc_submissions (extended columns). */
export function kycInsertSql() {
  return `INSERT INTO kyc_submissions (
        user_id, firebase_uid, full_name, birth_date, id_card_number,
        id_card_front_url, id_card_back_url, selfie_photo_url,
        driving_license_front_url, driving_license_back_url,
        selfie_video_url, status, address, vehicles_json,
        wants_public_transport, yellow_plate_photo_url,
        public_transport_license_front_url, public_transport_license_back_url,
        driver_license_number, driver_license_type, driver_license_class,
        id_card_expiry_date, driver_license_expiry,
        submitted_at
      ) VALUES (
        $1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
        $15, $16, $17, $18, $19, $20, $21::jsonb, $22::date, $23::date, NOW()
      ) RETURNING *`;
}

export function kycInsertParams(base, extended, uploadedFiles, expiryFields = {}) {
  const exp = expiryFields && typeof expiryFields === 'object' ? expiryFields : {};
  return [
    base.resolvedUserUuid,
    base.firebaseUid,
    base.fullName ?? null,
    base.birthDateNorm,
    base.idCardNorm,
    uploadedFiles.idCardFront ?? null,
    uploadedFiles.idCardBack ?? null,
    uploadedFiles.selfiePhoto ?? null,
    uploadedFiles.drivingLicenseFront ?? null,
    uploadedFiles.drivingLicenseBack ?? null,
    uploadedFiles.selfieVideo ?? null,
    'pending_review',
    base.addressNorm,
    base.vehiclesJsonParam,
    extended.wants_public_transport,
    extended.yellow_plate_photo_url,
    extended.public_transport_license_front_url,
    extended.public_transport_license_back_url,
    extended.driver_license_number,
    extended.driver_license_type,
    extended.driver_license_class,
    exp.id_card_expiry_date ?? null,
    exp.driver_license_expiry ?? null,
  ];
}
