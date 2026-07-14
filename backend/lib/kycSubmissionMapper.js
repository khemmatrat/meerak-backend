/** Map kyc_submissions row → admin / mobile document shape */

function parseVehiclesJson(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return raw ?? null;
}

export function kycSubmissionToAdminDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    id_card_front_url: row.id_card_front_url ?? null,
    id_card_back_url: row.id_card_back_url ?? null,
    selfie_photo_url: row.selfie_photo_url ?? null,
    driving_license_front_url: row.driving_license_front_url ?? null,
    driving_license_back_url: row.driving_license_back_url ?? null,
    selfie_video_url: row.selfie_video_url ?? null,
    full_name: row.full_name ?? null,
    birth_date: row.birth_date ?? null,
    id_card_number: row.id_card_number ?? null,
    address: row.address ?? null,
    vehicles_json: parseVehiclesJson(row.vehicles_json),
    wants_public_transport: !!row.wants_public_transport,
    yellow_plate_photo_url: row.yellow_plate_photo_url ?? null,
    public_transport_license_front_url: row.public_transport_license_front_url ?? null,
    public_transport_license_back_url: row.public_transport_license_back_url ?? null,
    driver_license_number: row.driver_license_number ?? null,
    driver_license_type: row.driver_license_type ?? null,
    driver_license_class: row.driver_license_class ?? null,
    rejection_reason: row.rejection_reason ?? null,
    admin_notes: row.admin_notes ?? null,
    id_card_expiry_date: row.id_card_expiry_date
      ? new Date(row.id_card_expiry_date).toISOString().slice(0, 10)
      : null,
    driver_license_expiry: row.driver_license_expiry
      ? new Date(row.driver_license_expiry).toISOString().slice(0, 10)
      : null,
  };
}

export function kycSubmissionToMobileOwner(row) {
  if (!row) return null;
  const submittedAt = row.submitted_at ? new Date(row.submitted_at).toISOString() : undefined;
  return {
    id: row.id,
    status: row.status,
    submitted_at: submittedAt,
    id_card_front_url: row.id_card_front_url ?? null,
    id_card_back_url: row.id_card_back_url ?? null,
    selfie_photo_url: row.selfie_photo_url ?? null,
    driving_license_front_url: row.driving_license_front_url ?? null,
    driving_license_back_url: row.driving_license_back_url ?? null,
    selfie_video_url: row.selfie_video_url ?? null,
    full_name: row.full_name ?? null,
    birth_date: row.birth_date ?? null,
    id_card_number: row.id_card_number ?? null,
    address: row.address ?? null,
    vehicles_json: row.vehicles_json ?? null,
    wants_public_transport: !!row.wants_public_transport,
    yellow_plate_photo_url: row.yellow_plate_photo_url ?? null,
    public_transport_license_front_url: row.public_transport_license_front_url ?? null,
    public_transport_license_back_url: row.public_transport_license_back_url ?? null,
    driver_license_number: row.driver_license_number ?? null,
    driver_license_type: row.driver_license_type ?? null,
    driver_license_class: row.driver_license_class ?? null,
    id_card_expiry_date: row.id_card_expiry_date
      ? new Date(row.id_card_expiry_date).toISOString().slice(0, 10)
      : null,
    driver_license_expiry: row.driver_license_expiry
      ? new Date(row.driver_license_expiry).toISOString().slice(0, 10)
      : null,
  };
}
