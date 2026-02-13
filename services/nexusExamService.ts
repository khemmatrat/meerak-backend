/**
 * Nexus Exam Engine — Module 2 (Technical), Module 3 (Scenario)
 * ใช้ backend /api/nexus-exam/questions และ /api/nexus-exam/submit
 */
import { api } from './api';

export const NEXUS_MODULE2_CATEGORIES = [
  'Cleaning', 'Delivery', 'Tutoring', 'Repair', 'Beauty', 'Moving', 'Pet Care', 'Gardening',
  'Photography', 'Event', 'Catering', 'Driving', 'Security', 'IT Support', 'Accounting',
  'Legal', 'Medical', 'Construction', 'Design', 'Other',
] as const;

export type NexusModule2Category = typeof NEXUS_MODULE2_CATEGORIES[number];

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
  exam_results?: ExamResultRow[];
}

export async function getNexusQuestions(
  module: 2 | 3,
  category?: string
): Promise<NexusQuestionsResponse> {
  const params: Record<string, string> = { module: String(module) };
  if (module === 2 && category) params.category = category;
  const res = await api.get<NexusQuestionsResponse>('/nexus-exam/questions', { params });
  return res.data;
}

export async function submitNexusExam(params: {
  userId: string;
  module: 2 | 3;
  category?: string;
  answers: Record<string, string>;
  time_spent_seconds?: number;
  started_at?: string;
}): Promise<NexusSubmitResponse> {
  const res = await api.post<NexusSubmitResponse>('/nexus-exam/submit', params);
  return res.data;
}

export async function getProviderOnboardingStatus(userId: string): Promise<ProviderOnboardingStatus> {
  const res = await api.get<ProviderOnboardingStatus>('/provider-onboarding/status', {
    params: { userId },
  });
  return res.data;
}
