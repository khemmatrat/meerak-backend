import type { MobileAppRemote } from "../context/MobileAppConfigContext";

export type JobBoardRemoteCopy = {
  /** A/B experiment id — ส่งใน analytics ทุก CTA สำคัญ */
  experimentId?: string;
  /** A/B variant เช่น control | variant_a */
  variant?: string;
  smartMatchTitle?: string;
  smartMatchTooltip?: string;
  emptyAllBullets?: string[];
  emptyMyJobsBullets?: string[];
  emptyApplicationsBullets?: string[];
  emptySavedBullets?: string[];
  appliedModalBody?: string;
  manageNoApplicantsBullets?: string[];
  createJobDescPlaceholder?: string;
  hireSummarySteps?: string[];
  smartMatchReasonLabels?: {
    saved?: string;
    applied?: string;
    profileProvince?: string;
    nearProvince?: string;
    routing?: string;
    categoryHistory?: string;
  };
};

export const DEFAULT_JOB_BOARD_COPY: Required<JobBoardRemoteCopy> = {
  experimentId: "",
  variant: "control",
  smartMatchTitle: "งานที่เหมาะกับคุณ",
  smartMatchTooltip: "เลือกจากหมวดงาน จังหวัดโปรไฟล์ และการตั้งค่าระบบของคุณ",
  emptyAllBullets: [
    "ลองปรับตัวกรองหมวดหรือจังหวัด",
    "ขยายช่วงงบประมาณเล็กน้อย",
    "หรือโพสต์งานแรกของคุณเป็นนายจ้าง",
  ],
  emptyMyJobsBullets: [
    "โพสต์งานพร้อมหัวข้อและงบที่ชัดเจน",
    "เลือกหมวดให้ตรงกับงานจริง",
    "แชร์ลิงก์งานหลังโพสต์เพื่อหาผู้สนใจเร็วขึ้น",
  ],
  emptyApplicationsBullets: [
    "เลือกหมวดที่ถนัดจากตัวกรอง",
    "สมัครงานที่งบและระยะเวลาเหมาะกับคุณ",
    "เพิ่มใบเสนอราคาสั้น ๆ ช่วยให้นายจ้างตัดสินใจเร็วขึ้น",
  ],
  emptySavedBullets: [
    "กดไอคอนบันทึกบนการ์ดงานที่สนใจ",
    "กลับมาเปรียบเทียบก่อนสมัคร",
    "งานที่บันทึกจะอยู่แท็บนี้เสมอ",
  ],
  appliedModalBody: "แนะนำทักนายจ้างเพื่อแนะนำตัวและถามรายละเอียดเพิ่ม",
  manageNoApplicantsBullets: [
    "แชร์ลิงก์งานให้เครือข่ายหรือโซเชียล",
    "ปรับงบให้สูงขึ้นเล็กน้อยถ้าเป็นตลาดแข่งขันสูง",
    "ตรวจหัวข้องานและคำอธิบายให้ชัดเจนขึ้น",
  ],
  createJobDescPlaceholder:
    "เช่น ต้องการออกแบบโลโก้คาเฟ่ สไตล์มินิมอล ส่งไฟล์ AI/PDF",
  hireSummarySteps: [
    "โอนเงินเข้าระบบค้ำตามงบที่ตกลง",
    "ยืนยันขอบเขตงานกับผู้รับจ้างในแท็บขอบเขต",
    "รอรับงานส่งมอบเมื่อโอนเงินแล้ว",
  ],
  smartMatchReasonLabels: {
    saved: "งานที่คุณบันทึก",
    applied: "หมวดที่คุณเคยดู/สมัคร",
    profileProvince: "จังหวัดโปรไฟล์ของคุณ",
    nearProvince: "ใกล้จังหวัดที่คุณเลือก",
    routing: "แนะนำโดยระบบ",
    categoryHistory: "หมวดที่คุณสนใจ",
  },
};

function pickBullets(
  custom: string[] | undefined,
  fallback: string[],
): string[] {
  const list = (custom || []).map((s) => String(s || "").trim()).filter(Boolean);
  return list.length ? list : fallback;
}

export function resolveJobBoardCopy(
  remote?: MobileAppRemote | null,
): Required<JobBoardRemoteCopy> {
  const c = remote?.jobBoardCopy;
  return {
    experimentId: c?.experimentId?.trim() || DEFAULT_JOB_BOARD_COPY.experimentId,
    variant: c?.variant?.trim() || DEFAULT_JOB_BOARD_COPY.variant,
    smartMatchTitle:
      c?.smartMatchTitle?.trim() || DEFAULT_JOB_BOARD_COPY.smartMatchTitle,
    smartMatchTooltip:
      c?.smartMatchTooltip?.trim() || DEFAULT_JOB_BOARD_COPY.smartMatchTooltip,
    emptyAllBullets: pickBullets(
      c?.emptyAllBullets,
      DEFAULT_JOB_BOARD_COPY.emptyAllBullets,
    ),
    emptyMyJobsBullets: pickBullets(
      c?.emptyMyJobsBullets,
      DEFAULT_JOB_BOARD_COPY.emptyMyJobsBullets,
    ),
    emptyApplicationsBullets: pickBullets(
      c?.emptyApplicationsBullets,
      DEFAULT_JOB_BOARD_COPY.emptyApplicationsBullets,
    ),
    emptySavedBullets: pickBullets(
      c?.emptySavedBullets,
      DEFAULT_JOB_BOARD_COPY.emptySavedBullets,
    ),
    appliedModalBody:
      c?.appliedModalBody?.trim() || DEFAULT_JOB_BOARD_COPY.appliedModalBody,
    manageNoApplicantsBullets: pickBullets(
      c?.manageNoApplicantsBullets,
      DEFAULT_JOB_BOARD_COPY.manageNoApplicantsBullets,
    ),
    createJobDescPlaceholder:
      c?.createJobDescPlaceholder?.trim() ||
      DEFAULT_JOB_BOARD_COPY.createJobDescPlaceholder,
    hireSummarySteps: pickBullets(
      c?.hireSummarySteps,
      DEFAULT_JOB_BOARD_COPY.hireSummarySteps,
    ),
    smartMatchReasonLabels: {
      ...DEFAULT_JOB_BOARD_COPY.smartMatchReasonLabels,
      ...(c?.smartMatchReasonLabels || {}),
    },
  };
}
