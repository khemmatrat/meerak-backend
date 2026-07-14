export type KycDocSlot = {
  verified?: boolean;
  locked?: boolean;
  uploaded?: boolean;
};

export type KycDocumentVerification = {
  kycStatus?: string;
  kycApproved?: boolean;
  canEditDocuments?: boolean;
  resubmitRequired?: boolean;
  supplementRequired?: boolean;
  resubmitTrigger?: string | null;
  adminInstruction?: string | null;
  documents?: Record<string, KycDocSlot>;
};

export function isKycDocVerified(
  gate: KycDocumentVerification | null | undefined,
  key: string,
): boolean {
  return !!gate?.documents?.[key]?.verified;
}

export function isKycDocLocked(
  gate: KycDocumentVerification | null | undefined,
  key: string,
): boolean {
  const slot = gate?.documents?.[key];
  if (slot?.locked) return true;
  return !!gate?.kycApproved && !gate?.canEditDocuments && !!slot?.uploaded;
}

export function canEditKycDocuments(
  gate: KycDocumentVerification | null | undefined,
): boolean {
  if (!gate) return true;
  return !!gate.canEditDocuments;
}

/** แอดมินขอเอกสารเพิ่มหรือส่งใหม่ — ต้องปลดล็อก */
export function needsKycDocumentResubmit(
  gate: KycDocumentVerification | null | undefined,
): boolean {
  return !!(gate?.resubmitRequired || gate?.supplementRequired);
}

/** แสดง badge Verified บน Profile — ไม่แสดงเมื่อยังต้องส่งเอกสาร */
export function kycProfileShowsVerified(
  kycLevel: string | undefined | null,
  gate: KycDocumentVerification | null | undefined,
): boolean {
  return kycLevel === "level_2" && !needsKycDocumentResubmit(gate);
}

/** แสดง ✓ Verified บนแถว Settings */
export function kycSettingsRowBadge(
  gate: KycDocumentVerification | null | undefined,
): string {
  if (gate?.resubmitRequired) return "⚠ ต้องส่งเอกสารใหม่";
  if (gate?.supplementRequired) return "⚠ เอกสารเพิ่ม";
  if (gate?.kycApproved) return "✓ Verified";
  return "";
}
