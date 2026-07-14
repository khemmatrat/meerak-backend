import { api } from "./api";

export interface TalentVideoEntitlement {
  found: boolean;
  locked?: boolean;
  creditsRemaining?: number;
  milestone?: {
    target: number;
    qualified: number;
    unlocked: boolean;
    progressPct: number;
  } | null;
  referralCode?: string | null;
  sharePath?: string | null;
}

export interface TalentVideoJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  script_text?: string;
  avatar_url?: string;
  output_url?: string | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

function userId(): string | null {
  return typeof localStorage !== "undefined"
    ? localStorage.getItem("meerak_user_id")
    : null;
}

export async function fetchTalentVideoEntitlement(): Promise<TalentVideoEntitlement> {
  const uid = userId();
  if (!uid) return { found: false };
  const { data } = await api.get<TalentVideoEntitlement>(
    "/talent-video/entitlement",
    { params: { userId: uid }, timeout: 20000 },
  );
  return data;
}

export async function startTalentVideoGeneration(payload: {
  script_text: string;
  avatar_url: string;
  character?: string;
}): Promise<{ jobId: string; status: string }> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const { data } = await api.post("/talent-video/generate", {
    userId: uid,
    ...payload,
  });
  return data;
}

export async function pollTalentVideoJob(
  jobId: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<TalentVideoJob> {
  const uid = userId();
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อน");
  const interval = opts?.intervalMs ?? 3000;
  const max = opts?.maxAttempts ?? 60;

  for (let i = 0; i < max; i++) {
    const { data } = await api.get<TalentVideoJob>(
      `/talent-video/jobs/${jobId}`,
      { params: { userId: uid }, timeout: 20000 },
    );
    if (data.status === "completed" || data.status === "failed") return data;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("ใช้เวลานานกว่าปกติ — ลองเปิดหน้านี้อีกครั้งในอีกสักครู่");
}

export async function listTalentVideoJobs(): Promise<TalentVideoJob[]> {
  const uid = userId();
  if (!uid) return [];
  const { data } = await api.get<{ jobs: TalentVideoJob[] }>(
    "/talent-video/jobs",
    { params: { userId: uid } },
  );
  return data.jobs || [];
}
