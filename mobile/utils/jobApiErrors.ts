/**
 * User-facing messages for job complete / proof verify API errors (uses i18n keys under detail.*).
 */
export function messageForJobCompleteError(
  err: any,
  t: (key: string) => string
): string {
  const code = String(err?.code || err?.response?.data?.error || "").trim();
  const serverMsg = err?.response?.data?.message || err?.message;
  const keyMap: Record<string, string> = {
    proof_not_verified: "detail.err_complete_proof_not_verified",
    proof_vision_required: "detail.err_complete_proof_vision_required",
    proof_columns_missing: "detail.err_complete_proof_columns_missing",
    meet_code_required: "detail.err_complete_meet_code_required",
    meet_code_invalid: "detail.err_complete_meet_code_invalid",
    "Safety verification required": "detail.err_complete_safety",
    gps_timestamp_invalid: "detail.err_complete_gps_stale",
    invalid_status_transition: "detail.err_complete_invalid_status",
  };
  if (code && keyMap[code]) return t(keyMap[code]);
  if (serverMsg && String(serverMsg).trim()) return String(serverMsg).trim();
  return t("detail.err_complete_generic");
}

export function messageForProofVerifyError(
  err: any,
  t: (key: string) => string
): string {
  const code = String(err?.response?.data?.error || "").trim();
  const serverMsg = err?.response?.data?.message;
  const keyMap: Record<string, string> = {
    geo_mismatch: "detail.err_proof_geo_mismatch",
    forbidden: "detail.err_proof_forbidden",
    invalid_status: "detail.err_proof_invalid_status",
    imageUrl_required: "detail.err_proof_image_required",
    invalid_phase: "detail.err_proof_invalid_phase",
    proof_columns_missing: "detail.err_complete_proof_columns_missing",
  };
  if (code === "proof_rejected" && serverMsg && String(serverMsg).trim()) {
    return String(serverMsg).trim();
  }
  if (code && keyMap[code]) return t(keyMap[code]);
  if (serverMsg && String(serverMsg).trim()) return String(serverMsg).trim();
  return t("detail.proof_verify_failed");
}
