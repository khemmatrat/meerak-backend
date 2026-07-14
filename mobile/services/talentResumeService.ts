import { api } from "./api";

export interface TalentResumeExperience {
  title: string;
  company: string;
  bullet?: string;
  description?: string;
}

export interface TalentResumeDraft {
  headline_th: string;
  about_th: string;
  video_script_th: string;
  skills_highlight: string[];
  experience_highlight: TalentResumeExperience[];
  hashtags: string[];
  completeness_score: number;
  coaching_tip_th?: string;
  source?: string;
}

export interface TalentResumeProfileContext {
  user_id: string;
  talent_name: string;
  avatar_url?: string | null;
  bio?: string;
  category_hint?: string;
  existing_headline?: string;
  existing_journey?: string;
  skills?: string[];
  work_experience?: unknown[];
  education?: unknown[];
  completed_jobs_count?: number;
  rating?: number | null;
  greeting_video_url?: string | null;
}

export interface TalentResumeDraftResponse {
  profile: TalentResumeProfileContext;
  draft: TalentResumeDraft;
  sources?: { structure?: string; prose?: string | null };
}

function userId(): string | null {
  return typeof localStorage !== "undefined"
    ? localStorage.getItem("meerak_user_id")
    : null;
}

export async function fetchTalentResumeDraft(): Promise<TalentResumeDraftResponse> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.get<TalentResumeDraftResponse>("/talent-resume/draft", {
    params: { userId: uid },
    timeout: 65000,
  });
  return data;
}

export async function publishTalentResume(payload: {
  headline_th?: string;
  about_th?: string;
  video_script_th?: string;
  greeting_video_url?: string;
  skills_highlight?: string[];
  experience_highlight?: TalentResumeExperience[];
}): Promise<{ published: boolean }> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post("/talent-resume/publish", {
    userId: uid,
    ...payload,
  });
  return data;
}
