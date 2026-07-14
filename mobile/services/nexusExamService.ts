/**
 * Nexus Exam Engine — Module 2 (Technical), Module 3 (Scenario)
 * ใช้ backend /api/nexus-exam/questions และ /api/nexus-exam/submit
 */
import { api } from "./api";
import { brandCourseText } from "./trainingService";

export const NEXUS_MODULE2_CATEGORIES = [
  // ── งานบ้าน ──
  "Cleaning",
  "Gardening",
  "Moving",
  // ── ช่าง ──
  "Repair",
  "AC Technician",
  "Construction",
  // ── ขนส่ง & ความปลอดภัย ──
  "Delivery",
  "Driving",
  "Messenger",
  "Public Transport",
  "Security",
  // ── อาหาร ──
  "Chef",
  "Catering",
  // ── ดูแลบุคคล ──
  "Babysitter",
  "Elderly",
  "Massage",
  // ── สุขภาพ & ความงาม ──
  "Beauty",
  "Trainer",
  // ── สัตว์เลี้ยง ──
  "Pet Care",
  // ── ไอที ──
  "IT Support",
  // ── การสอน & ฝึก ──
  "Tutor",
  "Tutoring",
  // ── ครีเอทีฟ ──
  "Photography",
  "Design",
  // ── ธุรกิจ & วิชาชีพ ──
  "Event",
  "Accounting",
  "Legal",
  "Medical",
] as const;

export type NexusModule2Category = (typeof NEXUS_MODULE2_CATEGORIES)[number];

/**
 * Categories ที่มีข้อสอบจริงใน backend แล้ว
 * ถ้าไม่อยู่ใน set นี้ จะแสดง "กำลังมาเร็วๆ นี้" และ disable ปุ่ม
 */
export const CATEGORIES_WITH_QUESTIONS = new Set<string>([
  "Cleaning",
  "Delivery",
  "Tutoring",
  "Repair",
  "Beauty",
  "Moving",
  "Pet Care",
  "Gardening",
  "Photography",
  "Driving",
  "Messenger",
  "Public Transport",
  "Security",
  "IT Support",
  "Construction",
  "Chef",
  "AC Technician",
  "Babysitter",
  "Tutor",
  "Massage",
  "Trainer",
  "Catering",
  "Design",
  "Elderly",
  "Accounting",
  "Legal",
  "Event",
  "Medical",
]);

/** นาทีต่อ module (ส่งไป backend เป็น time_spent_seconds ได้) */
export const NEXUS_TIME_LIMIT_MINUTES = {
  module1: 45,
  module2: 40,
  module3: 30,
} as const;

export interface NexusQuestionOption {
  id: string;
  text: string;
}

export interface NexusQuestion {
  id: string;
  text: string;
  options: NexusQuestionOption[];
  recommended_action?: string;
}

export interface NexusQuestionsResponse {
  module: number;
  category?: string;
  questions: NexusQuestion[];
}

export interface NexusSubmitResponse {
  passed: boolean;
  score: number;
  module: number;
  onboarding_status?: string;
  message?: string;
  nextRetryAt?: string;
}

export interface ExamResultRow {
  module: number;
  category: string | null;
  attempt: number;
  score: number;
  passed: boolean;
  submitted_at: string | null;
  time_spent_seconds: number | null;
}

export interface ProviderOnboardingStatus {
  provider_status: string;
  provider_verified_at: string | null;
  provider_test_next_retry_at: string | null;
  provider_test_attempts: number;
  onboarding_status?: string;
  kyc_status?: string;
  exam_results?: ExamResultRow[];
}

/** Get current app language for API (used for question content) */
function getAppLang(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("aqond_lang");
    if (stored && ["en", "th"].includes(stored)) return stored;
  }
  return "en";
}

/** ดึงข้อสอบ Module 1 (55 ข้อจริงจาก DB/seed) สำหรับคอร์ส nexus-professional-standards */
export async function getModule1Questions(): Promise<{
  module: number;
  questions: Array<{
    id: string;
    text: string;
    type: "mcq";
    options: Array<{ id: string; text: string }>;
  }>;
}> {
  const lang = getAppLang();
  const res = await api.get<{
    module: number;
    questions: Array<{
      id: string;
      text: string;
      options?: Array<{ id: string; text: string }>;
    }>;
  }>("/nexus-exam/questions", { params: { module: 1, lang } });
  const questions = (res.data.questions || []).map((q) => ({
    id: q.id,
    text: brandCourseText(q.text),
    type: "mcq" as const,
    options: Array.isArray(q.options)
      ? q.options.map((o) => ({ ...o, text: brandCourseText(o.text) }))
      : [],
  }));
  return { module: 1, questions };
}

export async function getNexusQuestions(
  module: 2 | 3,
  category?: string,
): Promise<NexusQuestionsResponse> {
  const params: Record<string, string> = {
    module: String(module),
    lang: getAppLang(),
  };
  if (module === 2 && category) params.category = category;
  const res = await api.get<NexusQuestionsResponse>("/nexus-exam/questions", {
    params,
  });
  const data = res.data;
  return {
    ...data,
    questions: (data.questions || []).map((q) => ({
      ...q,
      text: brandCourseText(q.text),
      recommended_action: q.recommended_action
        ? brandCourseText(q.recommended_action)
        : q.recommended_action,
      options: (q.options || []).map((o) => ({
        ...o,
        text: brandCourseText(o.text),
      })),
    })),
  };
}

export async function submitNexusExam(params: {
  userId: string;
  module: 2 | 3;
  category?: string;
  answers: Record<string, string>;
  time_spent_seconds?: number;
  started_at?: string;
}): Promise<NexusSubmitResponse> {
  const res = await api.post<NexusSubmitResponse>("/nexus-exam/submit", params);
  return res.data;
}

/** ใช้ backend_user_id จาก localStorage ถ้ามี (หลังทำข้อสอบผ่าน backend ส่งกลับมา) เพื่อให้ backend เจอ user เดียวกัน */
function getProviderUserId(frontendUserId: string): string {
  try {
    const raw = localStorage.getItem("meerak_provider_backend_id");
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[frontendUserId]) return map[frontendUserId];
    }
  } catch (_) {}
  return "";
}

export async function getProviderOnboardingStatus(
  userId: string,
): Promise<ProviderOnboardingStatus> {
  const idToUse = getProviderUserId(userId) || userId;
  const res = await api.get<ProviderOnboardingStatus>(
    "/provider-onboarding/status",
    {
      params: { userId: idToUse },
    },
  );
  return res.data;
}

export interface Module2PassedCategory {
  skill_name: string;
  certified_at: string;
  certification_id: string;
}

/** ดึงรายการ Module 2 categories ที่ user สอบผ่านแล้ว */
export async function getModule2PassedCategories(
  userId: string,
): Promise<Module2PassedCategory[]> {
  // ใช้ backend UUID ถ้ามีใน localStorage map ไม่งั้นใช้ userId ที่ส่งมาโดยตรง
  const idToUse = getProviderUserId(userId) || userId;
  try {
    const res = await api.get<{ categories: Module2PassedCategory[] }>(
      "/nexus-exam/module2-passed",
      { params: { userId: idToUse } },
    );
    const cats = res.data.categories || [];
    console.log(
      `[nexusExamService] module2-passed → userId=${idToUse}, found=${cats.length}`,
    );
    return cats;
  } catch (err: any) {
    console.error(
      "[nexusExamService] getModule2PassedCategories error:",
      err?.response?.status,
      err?.message,
    );
    return [];
  }
}
