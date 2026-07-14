/**
 * นโยบายจาก compliance_policies — GET /api/compliance/types + GET /api/compliance/:type
 * แคชตามเวอร์ชัน (จากรายการ types) + TTL เพื่อไม่ต้องออกแอปใหม่เมื่อแอดมินแก้ข้อความ
 */
import { api } from "./api";

export type CompliancePolicyRow = {
  id: string;
  type: string;
  version: string;
  content: string;
  published_at: string;
  created_at?: string;
};

export type ComplianceTypeMeta = {
  type: string;
  version: string;
  published_at: string;
};

const typesCache: { at: number; list: ComplianceTypeMeta[] } = { at: 0, list: [] };
const TYPES_TTL_MS = 60_000;

type CachedPolicy = {
  policy: CompliancePolicyRow;
  fetchedAt: number;
  /** เวอร์ชันที่ sync กับ GET /compliance/types ตอนเก็บแคช */
  sourceVersion: string;
};

const policyCache = new Map<string, CachedPolicy>();
const POLICY_SOFT_TTL_MS = 5 * 60_000;

/** สแนปช็อตเวอร์ชันล่าสุดจาก GET /api/app/bootstrap — ถ้าเปลี่ยนเมื่อเทียบครั้งก่อน จะล้างแคช terms/privacy */
let prevBootstrapComplianceVersions: { terms: string | null; privacy: string | null } | null = null;

/**
 * เรียกจาก MobileAppConfigProvider หลังโหลด bootstrap — ล้างแคชเมื่อเวอร์ชัน terms/privacy เปลี่ยน
 * เพื่อให้หน้า Terms/Privacy ดึงเนื้อหาใหม่โดยไม่ต้องรอ TTL
 */
export function applyBootstrapComplianceVersions(v: {
  terms: string | null;
  privacy: string | null;
}): void {
  if (!v || typeof v !== "object") return;
  const next = { terms: v.terms ?? null, privacy: v.privacy ?? null };
  const prev = prevBootstrapComplianceVersions;
  prevBootstrapComplianceVersions = next;
  if (!prev) return;

  const termsChanged = (prev.terms ?? "") !== (next.terms ?? "");
  const privacyChanged = (prev.privacy ?? "") !== (next.privacy ?? "");
  if (!termsChanged && !privacyChanged) return;

  typesCache.at = 0;
  typesCache.list = [];
  if (termsChanged) policyCache.delete("terms");
  if (privacyChanged) policyCache.delete("privacy");
}

export async function fetchComplianceTypes(options?: { force?: boolean }): Promise<ComplianceTypeMeta[]> {
  if (!options?.force && Date.now() - typesCache.at < TYPES_TTL_MS && typesCache.list.length) {
    return typesCache.list;
  }
  const { data } = await api.get<{ types: ComplianceTypeMeta[] }>("/compliance/types");
  const list = data.types || [];
  typesCache.at = Date.now();
  typesCache.list = list;
  return list;
}

/**
 * ดึงนโยบายล่าสุด — ถ้าเวอร์ชันใน /compliance/types เปลี่ยนเมื่อเทียบกับแคช จะดึงใหม่
 */
export async function fetchCompliancePolicy(
  type: string,
  options?: { force?: boolean },
): Promise<CompliancePolicyRow | null> {
  const force = options?.force === true;
  let list: ComplianceTypeMeta[] = [];
  try {
    list = await fetchComplianceTypes({ force });
  } catch {
    list = typesCache.list;
  }
  const meta = list.find((t) => t.type === type);
  const publishedVersion = meta?.version ?? "";

  const cached = policyCache.get(type);
  if (
    !force &&
    cached &&
    publishedVersion &&
    cached.sourceVersion === publishedVersion
  ) {
    return cached.policy;
  }
  if (!force && cached && Date.now() - cached.fetchedAt < POLICY_SOFT_TTL_MS && !publishedVersion) {
    return cached.policy;
  }

  try {
    const { data } = await api.get<{ policy: CompliancePolicyRow }>(`/compliance/${encodeURIComponent(type)}`);
    const p = data.policy;
    if (p) {
      policyCache.set(type, {
        policy: p,
        fetchedAt: Date.now(),
        sourceVersion: publishedVersion || p.version,
      });
    }
    return p ?? null;
  } catch {
    return cached?.policy ?? null;
  }
}

/** โหลดหลาย type พร้อมกัน (เช่น หน้าสมัครสมาชิก) */
export async function fetchCompliancePolicies(
  types: string[],
  options?: { force?: boolean },
): Promise<Record<string, CompliancePolicyRow | null>> {
  const out: Record<string, CompliancePolicyRow | null> = {};
  await Promise.all(
    types.map(async (t) => {
      out[t] = await fetchCompliancePolicy(t, options).catch(() => null);
    }),
  );
  return out;
}

export function clearCompliancePolicyCache() {
  typesCache.at = 0;
  typesCache.list = [];
  policyCache.clear();
  prevBootstrapComplianceVersions = null;
}
