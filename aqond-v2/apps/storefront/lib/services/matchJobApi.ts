import type { AuthState } from '@/lib/bff';
import { JobStatus, type MatchJob } from './matchJobTypes';

const TEMP_JOBS_KEY = 'temp_jobs';

function authHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  return h;
}

function normalizeJob(j: Record<string, unknown>): MatchJob {
  const loc = j.location;
  return {
    ...(j as unknown as MatchJob),
    id: j.id != null ? String(j.id) : '',
    location:
      typeof loc === 'object' && loc
        ? (loc as MatchJob['location'])
        : { lat: 13.736717, lng: 100.523186 },
    datetime: String(j.datetime || j.created_at || ''),
    status: (j.status as string) || JobStatus.OPEN,
  };
}

function readTempJobs(): MatchJob[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(TEMP_JOBS_KEY) || '[]') as MatchJob[];
  } catch {
    return [];
  }
}

export async function fetchMatchJobs(
  category?: string,
  searchQuery?: string,
  auth?: AuthState | null,
): Promise<MatchJob[]> {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (searchQuery) params.set('search', searchQuery);
  const q = params.toString();
  const res = await fetch(`/api/services/match/jobs${q ? `?${q}` : ''}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => []);
  const rows = (Array.isArray(data) ? data : []).map((j) => normalizeJob(j as Record<string, unknown>));
  const tempJobs = readTempJobs();
  const allJobs = [...rows, ...tempJobs];
  return allJobs.filter((job) => {
    const categoryMatch = !category || category === 'All' || job.category === category;
    const searchMatch =
      !searchQuery ||
      job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });
}

export async function fetchMatchJobDetail(
  jobId: string,
  auth?: AuthState | null,
): Promise<MatchJob | undefined> {
  const res = await fetch(`/api/services/match/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  if (res.status === 404) return undefined;
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) return undefined;
  return normalizeJob(data as Record<string, unknown>);
}

export async function fetchMatchJobSearchSuggestions(queryText: string): Promise<string[]> {
  if (!queryText || queryText.length < 2) return [];
  const jobs = await fetchMatchJobs();
  const lowerQ = queryText.toLowerCase();
  const titles = jobs
    .map((j) => j.title)
    .filter((t) => t?.toLowerCase().includes(lowerQ))
    .slice(0, 5);
  return Array.from(new Set(titles));
}

export async function acceptMatchJob(
  jobId: string,
  userId: string,
  auth?: AuthState | null,
  options?: { forceIgnoreConflict?: boolean },
): Promise<void> {
  const res = await fetch(`/api/services/match/jobs/${encodeURIComponent(jobId)}/accept`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      userId,
      force_ignore_conflict: options?.forceIgnoreConflict,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.error === 'string' && data.error) ||
      'ไม่สามารถรับงานได้';
    throw new Error(msg);
  }
}

export function matchJobStatusTone(status: string): 'pending' | 'active' | 'completed' | 'cancelled' | 'default' {
  const s = String(status || '').toLowerCase();
  if (s === JobStatus.OPEN) return 'pending';
  if (
    s === JobStatus.ACCEPTED ||
    s === JobStatus.IN_PROGRESS ||
    s === JobStatus.WAITING_FOR_APPROVAL ||
    s === JobStatus.WAITING_FOR_PAYMENT
  ) {
    return 'active';
  }
  if (s === JobStatus.COMPLETED) return 'completed';
  if (s === JobStatus.CANCELLED || s === JobStatus.DISPUTE) return 'cancelled';
  return 'default';
}

export function formatMatchJobPrice(price: number): string {
  return `฿${Number(price || 0).toLocaleString('th-TH')}`;
}

export type CreateMatchJobInput = {
  title: string;
  description: string;
  category: string;
  price: number;
  datetime: string;
  duration_hours: number;
  province: string;
  employment_type: string;
  location: MatchJob['location'];
  created_by: string;
  assigned_to?: string | null;
};

export type CreateMatchJobResult = {
  job: MatchJob;
  source: 'backend' | 'localstorage';
};

function writeTempJob(job: MatchJob): MatchJob {
  if (typeof window === 'undefined') return job;
  try {
    const tempJobs = JSON.parse(localStorage.getItem(TEMP_JOBS_KEY) || '[]') as MatchJob[];
    tempJobs.push(job);
    localStorage.setItem(TEMP_JOBS_KEY, JSON.stringify(tempJobs));
  } catch {
    /* ignore */
  }
  return job;
}

export async function createMatchJob(
  payload: CreateMatchJobInput,
  auth?: AuthState | null,
): Promise<CreateMatchJobResult> {
  const res = await fetch('/api/services/match/jobs', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...payload,
      status: 'open',
      tips_amount: 0,
      _submitted_at: new Date().toISOString(),
      _source: 'web_app',
      _employment_type: payload.employment_type,
      _target_province: payload.province,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    const job = normalizeJob((data?.job ?? data) as Record<string, unknown>);
    return { job, source: 'backend' };
  }
  const msg =
    (typeof data?.error === 'string' && data.error) ||
    (typeof data?.message === 'string' && data.message) ||
    'โพสต์งานไม่สำเร็จ';
  if (res.status === 401 || res.status === 403) throw new Error(msg);
  if (res.status === 400) throw new Error(msg);

  const tempJob = normalizeJob({
    ...payload,
    id: `temp_${Date.now()}`,
    status: 'pending',
    created_at: new Date().toISOString(),
    _source: 'localstorage',
  } as unknown as Record<string, unknown>);
  writeTempJob(tempJob);
  return { job: tempJob, source: 'localstorage' };
}

export async function fetchMyMatchJobs(
  userId: string,
  auth?: AuthState | null,
  options?: { includeExpired?: boolean },
): Promise<MatchJob[]> {
  const params = new URLSearchParams({ userId });
  if (options?.includeExpired) params.set('includeExpired', 'true');
  const res = await fetch(`/api/services/match/jobs/mine?${params}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => []);
  const rows = (Array.isArray(data) ? data : []).map((j) =>
    normalizeJob(j as Record<string, unknown>),
  );
  const tempJobs = readTempJobs().filter(
    (j) => j.created_by === userId || j.accepted_by === userId,
  );
  const byId = new Map<string, MatchJob>();
  [...tempJobs, ...rows].forEach((j) => byId.set(String(j.id), j));
  return Array.from(byId.values());
}

export type PaymentIntentResult = {
  clientSecret?: string;
  paymentIntentId?: string;
  amountThb?: number;
  publishableKey?: string;
  error?: string;
};

export async function createMatchJobPaymentIntent(
  jobId: string,
  auth?: AuthState | null,
  options?: { discountAmount?: number; has_insurance?: boolean },
): Promise<PaymentIntentResult> {
  const res = await fetch('/api/services/match/payment/create-intent', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      jobId,
      discountAmount: options?.discountAmount ?? 0,
      has_insurance: options?.has_insurance === true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      'ไม่สามารถสร้างรายการชำระเงินได้';
    throw new Error(msg);
  }
  return data as PaymentIntentResult;
}
