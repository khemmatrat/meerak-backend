/**
 * H7 — Talent OS release governance SSOT.
 * Feature flags, beta controls, and user-facing disclosure copy.
 * Presentation / rollout only — no business logic.
 */

function envTruthy(value: string | undefined, defaultWhenUnset: boolean): boolean {
  if (value === undefined || value === '') return defaultWhenUnset;
  return value === '1' || value.toLowerCase() === 'true';
}

/** Master switch — set `0` to hide hub entry tiles (rollback). Default: on. */
export function isTalentOsEnabled(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_TALENT_OS_ENABLED, true);
}

/** Beta cohort — shows workspace beta banner when true. Default: on (disclosure). */
export function isTalentOsBeta(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_TALENT_OS_BETA, true);
}

/** AI provider is mock until AI Core registers via TalentAiIntegrationPort. Default: mock on. */
export function isTalentAiMockMode(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_TALENT_AI_MOCK, true);
}

/** Client localStorage role hints (provider/enterprise preview). Off in production by default. */
export function isTalentRoleHintsEnabled(): boolean {
  return envTruthy(
    process.env.NEXT_PUBLIC_TALENT_ROLE_HINTS,
    process.env.NODE_ENV !== 'production',
  );
}

/** Shared read cache TTL override (ms). Falls back to talentDataCache default. */
export function talentDataCacheTtlMs(): number | undefined {
  const raw = process.env.NEXT_PUBLIC_TALENT_CACHE_TTL_MS;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const TALENT_RELEASE_VERSION = '1.0.0-h7';

export const TALENT_GOVERNANCE_COPY = {
  betaBanner:
    'Talent OS v1 — เวอร์ชัน Beta · ข้อมูลบางส่วนเป็นตัวอย่าง · AI ยังไม่เชื่อม LLM จริง',
  roleDisclaimer:
    'มุมมอง Workspace — ไม่ใช่สิทธิ์บัญชีจริง · สลับ role เพื่อดู UI เท่านั้น',
  mockAiBanner:
    'AI Workspace ใช้ Mock Provider — ไม่มีการเรียก LLM · ผลลัพธ์เป็นตัวอย่างเท่านั้น',
  commerceDisclaimer:
    'ตัวเลขประมาณการจากข้อมูลที่มี · ไม่ใช่สมุดบัญชีหรือยอดจ่ายจริง · ยืนยันที่กระเป๋าเงิน Account',
  notificationInboxNote:
    'กล่องแจ้งเตือนอ่านอย่างเดียว · การตั้งค่า push อยู่ที่บัญชี AQOND',
  placeholderTitle: 'เร็วๆ นี้',
  placeholderDescription:
    'ส่วนนี้จะรวมข้อมูลจาก Services และ Account · ใช้ลิงก์ด้านล่างไปยังหน้าที่พร้อมใช้งานแล้ว',
  enterprisePreview:
    'Preview workspace · ฟีเจอร์องค์กร/multi-seat ยังไม่พร้อม · ติดต่อ sales',
} as const;

export const TALENT_FEATURE_FLAGS = [
  {
    env: 'NEXT_PUBLIC_TALENT_OS_ENABLED',
    default: '1',
    purpose: 'Master enable — hub tiles and workspace routes',
  },
  {
    env: 'NEXT_PUBLIC_TALENT_OS_BETA',
    default: '1',
    purpose: 'Beta banner + release-note cohort labeling',
  },
  {
    env: 'NEXT_PUBLIC_TALENT_AI_MOCK',
    default: '1',
    purpose: 'Mock AI disclosure until AI Core provider swap',
  },
  {
    env: 'NEXT_PUBLIC_TALENT_ROLE_HINTS',
    default: '0 in production',
    purpose: 'localStorage provider/enterprise role expansion',
  },
  {
    env: 'NEXT_PUBLIC_TALENT_CACHE_TTL_MS',
    default: '30000',
    purpose: 'Shared read cache TTL (H5 / C7 scale plan)',
  },
] as const;
