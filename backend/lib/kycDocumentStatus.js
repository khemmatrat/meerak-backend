/**
 * สถานะเอกสาร KYC ต่อรายการ — ใช้ mobile Settings + admin
 */

export function buildKycDocumentVerification(user, latestSubmission) {
  const kycStatus = String(user?.kyc_status || 'not_submitted').toLowerCase();
  const subStatus = String(latestSubmission?.status || '').toLowerCase();
  const resubmitRequired = kycStatus === 'resubmission_required';
  const supplementRequired = kycStatus === 'supplement_required';
  const kycApprovedCore =
    kycStatus === 'approved' ||
    kycStatus === 'verified' ||
    subStatus === 'approved';
  /** แม้ submission เคย approved — ถ้าแอดมินขอเอกสารเพิ่ม/ส่งใหม่ ต้องไม่ถือว่า verified ล็อก */
  const kycApproved = kycApprovedCore && !resubmitRequired && !supplementRequired;
  const canEditDocuments =
    resubmitRequired ||
    supplementRequired ||
    kycStatus === 'rejected' ||
    kycStatus === 'not_submitted' ||
    !kycApprovedCore;

  const has = (url) => !!(url && String(url).trim());

  const sub = latestSubmission || {};
  const idFront = has(sub.id_card_front_url);
  const idBack = has(sub.id_card_back_url);
  const selfie = has(sub.selfie_photo_url);
  const dl = has(sub.driving_license_front_url);
  const yellow = has(sub.yellow_plate_photo_url);
  const ptFront = has(sub.public_transport_license_front_url);
  const ptBack = has(sub.public_transport_license_back_url);

  let vehicleReg = false;
  try {
    const vj = sub.vehicles_json;
    const arr = Array.isArray(vj) ? vj : typeof vj === 'string' ? JSON.parse(vj) : [];
    vehicleReg = Array.isArray(arr) && arr.some((v) => has(v?.registration_book_photo_url));
  } catch (_) { /* noop */ }

  const docVerified = (uploaded) => kycApproved && uploaded && !canEditDocuments;

  return {
    kycStatus,
    kycApproved,
    canEditDocuments,
    resubmitRequired,
    supplementRequired,
    resubmitTrigger: user?.kyc_resubmit_trigger || null,
    adminInstruction: user?.kyc_admin_instruction || null,
    idCardExpiryDate: sub.id_card_expiry_date || null,
    driverLicenseExpiry: sub.driver_license_expiry || null,
    documents: {
      national_id: {
        verified: docVerified(has(sub.id_card_number)),
        locked: kycApprovedCore && has(sub.id_card_number) && !canEditDocuments,
        uploaded: has(sub.id_card_number),
      },
      id_card_front: { verified: docVerified(idFront), uploaded: idFront },
      id_card_back: { verified: docVerified(idBack), uploaded: idBack },
      selfie: { verified: docVerified(selfie), uploaded: selfie },
      driver_license: { verified: docVerified(dl), uploaded: dl },
      vehicle_registration: { verified: docVerified(vehicleReg), uploaded: vehicleReg },
      yellow_plate: { verified: docVerified(yellow), uploaded: yellow },
      public_transport_license: {
        verified: docVerified(ptFront),
        uploaded: ptFront || ptBack,
      },
    },
  };
}
