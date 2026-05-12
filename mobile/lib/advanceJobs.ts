/**
 * Advance Job types and storage — แยกจากระบบ Match / MockApi โดยสิ้นเชิง
 * ใช้เฉพาะใน JobBoard, JobDetailAdvance, CreateJobAdvance
 */

export interface JobAdvance {
  id: string;
  title: string;
  description: string;
  scope: string;
  budget_min: number;
  budget_max: number;
  duration_days: number;
  category: string;
  created_by: string;
  created_by_name: string;
  employer_trust_score: number;
  status: "open" | "in_progress" | "completed";
  created_at: string;
}

const STORAGE_KEY = "meerak_advance_jobs";

function loadFromStorage(): JobAdvance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function saveToStorage(list: JobAdvance[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
}

export function getAdvanceJobsList(): JobAdvance[] {
  return loadFromStorage().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getAdvanceJobById(id: string): JobAdvance | null {
  return loadFromStorage().find((j) => j.id === id) ?? null;
}

export function createAdvanceJob(data: Omit<JobAdvance, "id" | "created_at">): JobAdvance {
  const list = loadFromStorage();
  const id = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const created_at = new Date().toISOString();
  const job: JobAdvance = { ...data, id, created_at };
  list.push(job);
  saveToStorage(list);
  return job;
}
