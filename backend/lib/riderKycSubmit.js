/**
 * Rider OS — submit / update full KYC documents on existing delivery partner row.
 */
import { kycInsertParams, kycInsertSql, parseKycExtendedFields, parseKycExpiryFields } from './kycSubmissionPersist.js';
import { notifyAdminKycSubmitted } from './adminLiveEvents.js';
import { parseRiderVehiclesJson, validateRiderKycDocuments } from './riderKycDocs.js';

function riderKycWhereClause() {
  return `(
    address ILIKE '%AQOND แอปไรเดอร์%'
    OR vehicles_json::text ILIKE '%aqond_storefront%'
    OR vehicles_json::text ILIKE '%aqond_delivery%'
    OR vehicles_json::text ILIKE '%rider_os%'
  )`;
}

export async function getRiderKycStatus(pool, userId) {
  const row = await pool.query(
    `SELECT id, status, submitted_at, reviewed_at,
            id_card_front_url, id_card_back_url, selfie_photo_url,
            driving_license_front_url, driving_license_back_url,
            wants_public_transport, yellow_plate_photo_url,
            public_transport_license_front_url, public_transport_license_back_url,
            vehicles_json, address
       FROM kyc_submissions
      WHERE user_id = $1::uuid AND ${riderKycWhereClause()}
      ORDER BY submitted_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const sub = row.rows?.[0] || null;
  const vehicles = parseRiderVehiclesJson(sub?.vehicles_json);
  const check = validateRiderKycDocuments({
    id_card_front_url: sub?.id_card_front_url,
    id_card_back_url: sub?.id_card_back_url,
    selfie_photo_url: sub?.selfie_photo_url,
    driving_license_front_url: sub?.driving_license_front_url,
    driving_license_back_url: sub?.driving_license_back_url,
    wants_public_transport: sub?.wants_public_transport,
    yellow_plate_photo_url: sub?.yellow_plate_photo_url,
    public_transport_license_front_url: sub?.public_transport_license_front_url,
    public_transport_license_back_url: sub?.public_transport_license_back_url,
    vehicles_json: vehicles,
  });

  return {
    submission_id: sub?.id || null,
    status: sub?.status || 'none',
    documents_complete: check.ok,
    missing: check.ok ? [] : check.missing || [],
    wants_public_transport: !!sub?.wants_public_transport,
    submitted_at: sub?.submitted_at || null,
  };
}

export async function submitRiderOsKyc(pool, {
  userId,
  fullName,
  idCardNumber,
  birthDate,
  addressText,
  vehiclesJson,
  uploadedFiles,
  extendedFields,
  expiryFields,
  isTrustedUrl,
}) {
  const vehicles = parseRiderVehiclesJson(vehiclesJson);
  const validation = validateRiderKycDocuments({
    id_card_front_url: uploadedFiles.idCardFront,
    id_card_back_url: uploadedFiles.idCardBack,
    selfie_photo_url: uploadedFiles.selfiePhoto,
    driving_license_front_url: uploadedFiles.drivingLicenseFront,
    driving_license_back_url: uploadedFiles.drivingLicenseBack,
    wants_public_transport: extendedFields.wants_public_transport,
    yellow_plate_photo_url: extendedFields.yellow_plate_photo_url,
    public_transport_license_front_url: extendedFields.public_transport_license_front_url,
    public_transport_license_back_url: extendedFields.public_transport_license_back_url,
    vehicles_json: vehicles,
  });
  if (!validation.ok) {
    const err = new Error('rider_kyc_incomplete');
    err.code = 'rider_kyc_incomplete';
    err.missing = validation.missing;
    throw err;
  }

  for (const [key, val] of Object.entries({
    idCardFront: uploadedFiles.idCardFront,
    idCardBack: uploadedFiles.idCardBack,
    selfiePhoto: uploadedFiles.selfiePhoto,
    drivingLicenseFront: uploadedFiles.drivingLicenseFront,
    drivingLicenseBack: uploadedFiles.drivingLicenseBack,
    yellow_plate: extendedFields.yellow_plate_photo_url,
    pt_front: extendedFields.public_transport_license_front_url,
    pt_back: extendedFields.public_transport_license_back_url,
  })) {
    if (val && !isTrustedUrl(val)) {
      const err = new Error(`invalid_url_${key}`);
      err.code = 'invalid_kyc_url';
      throw err;
    }
    for (const v of vehicles) {
      for (const k of [
        'registration_book_photo_url',
        'vehicle_photo_front_url',
        'vehicle_photo_back_url',
        'vehicle_photo_left_url',
        'vehicle_photo_right_url',
      ]) {
        const u = v[k];
        if (u && !isTrustedUrl(u)) {
          const err = new Error(`invalid_vehicle_url_${k}`);
          err.code = 'invalid_kyc_url';
          throw err;
        }
      }
    }
  }

  const existing = await pool.query(
    `SELECT id, status FROM kyc_submissions
      WHERE user_id = $1::uuid AND ${riderKycWhereClause()}
      ORDER BY submitted_at DESC NULLS LAST
      LIMIT 1`,
    [userId],
  );

  const vehiclesJsonParam = JSON.stringify(vehicles);
  const addressNorm = addressText || 'ช่องทาง: AQOND แอปไรเดอร์ | เอกสารครบชุด';

  let submissionId;
  if (existing.rows?.[0]) {
    const subId = existing.rows[0].id;
    await pool.query(
      `UPDATE kyc_submissions SET
         full_name = COALESCE($2, full_name),
         birth_date = COALESCE($3::date, birth_date),
         id_card_number = COALESCE($4, id_card_number),
         id_card_front_url = $5,
         id_card_back_url = $6,
         selfie_photo_url = $7,
         driving_license_front_url = $8,
         driving_license_back_url = $9,
         address = $10,
         vehicles_json = $11::jsonb,
         wants_public_transport = $12,
         yellow_plate_photo_url = $13,
         public_transport_license_front_url = $14,
         public_transport_license_back_url = $15,
         driver_license_number = COALESCE($16, driver_license_number),
         driver_license_type = COALESCE($17, driver_license_type),
         driver_license_class = COALESCE($18::jsonb, driver_license_class),
         id_card_expiry_date = COALESCE($19::date, id_card_expiry_date),
         driver_license_expiry = COALESCE($20::date, driver_license_expiry),
         status = 'pending_review',
         submitted_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [
        subId,
        fullName ?? null,
        birthDate ?? null,
        idCardNumber ?? null,
        uploadedFiles.idCardFront,
        uploadedFiles.idCardBack,
        uploadedFiles.selfiePhoto,
        uploadedFiles.drivingLicenseFront,
        uploadedFiles.drivingLicenseBack,
        addressNorm,
        vehiclesJsonParam,
        extendedFields.wants_public_transport,
        extendedFields.yellow_plate_photo_url,
        extendedFields.public_transport_license_front_url,
        extendedFields.public_transport_license_back_url,
        extendedFields.driver_license_number,
        extendedFields.driver_license_type,
        extendedFields.driver_license_class,
        expiryFields.id_card_expiry_date ?? null,
        expiryFields.driver_license_expiry ?? null,
      ],
    );
    submissionId = subId;
  } else {
    const insert = await pool.query(
      kycInsertSql(),
      kycInsertParams(
        {
          resolvedUserUuid: userId,
          firebaseUid: null,
          fullName: fullName ?? null,
          birthDateNorm: birthDate ?? null,
          idCardNorm: idCardNumber ?? null,
          addressNorm,
          vehiclesJsonParam,
        },
        extendedFields,
        uploadedFiles,
        expiryFields,
      ),
    );
    submissionId = insert.rows[0]?.id;
  }

  await pool.query(
    `UPDATE users SET kyc_status = 'pending_review', kyc_submitted_at = NOW() WHERE id = $1::uuid`,
    [userId],
  );

  try {
    await notifyAdminKycSubmitted(pool, {
      userId,
      submissionId,
      isSupplement: false,
    });
  } catch (e) {
    console.warn('notifyAdminKycSubmitted rider:', e?.message);
  }

  return { submission_id: submissionId, status: 'pending_review' };
}

export function buildRiderKycPayloadFromBody(body = {}) {
  const extended = parseKycExtendedFields(body);
  const expiry = parseKycExpiryFields(body);
  let vehicles = [];
  const raw = body.vehiclesJson ?? body.vehicles_json;
  if (raw != null) {
    try {
      vehicles = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (!Array.isArray(vehicles)) vehicles = [];
    } catch {
      vehicles = [];
    }
  }

  const uploadedFiles = {
    idCardFront: String(body.idCardFrontUrl || body.id_card_front_url || '').trim() || null,
    idCardBack: String(body.idCardBackUrl || body.id_card_back_url || '').trim() || null,
    selfiePhoto: String(body.selfiePhotoUrl || body.selfie_photo_url || '').trim() || null,
    drivingLicenseFront: String(body.drivingLicenseFrontUrl || body.driving_license_front_url || '').trim() || null,
    drivingLicenseBack: String(body.drivingLicenseBackUrl || body.driving_license_back_url || '').trim() || null,
    selfieVideo: null,
  };

  return { extended, expiry, vehicles, uploadedFiles };
}
