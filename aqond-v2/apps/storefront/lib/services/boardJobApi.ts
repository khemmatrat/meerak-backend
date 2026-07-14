import type { AuthState } from '@/lib/bff';
import type {
  BoardApplicant,
  BoardJob,
  BoardJobApplication,
  BoardJobFilters,
  BoardJobsTab,
  CreateBoardJobInput,
  EscrowBreakdown,
} from './boardJobTypes';

function authHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  return h;
}

function normalizeJob(j: Record<string, unknown>): BoardJob {
  return {
    ...(j as unknown as BoardJob),
    id: String(j.id ?? ''),
    min_budget: Number(j.min_budget ?? 0),
    max_budget: Number(j.max_budget ?? 0),
    duration_days: Number(j.duration_days ?? 0),
    applicant_count: Number(j.applicant_count ?? 0),
  };
}

export async function fetchBoardJobs(
  filters: BoardJobFilters,
  auth?: AuthState | null,
): Promise<{ jobs: BoardJob[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.target_province) params.set('target_province', filters.target_province);
  if (filters.employment_type) params.set('employment_type', filters.employment_type);
  if (filters.sort) params.set('sort', filters.sort);
  params.set('status', 'open');
  const q = params.toString();
  const res = await fetch(`/api/services/board/jobs${q ? `?${q}` : ''}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  const rows = (Array.isArray(data?.jobs) ? data.jobs : []).map((j: Record<string, unknown>) =>
    normalizeJob(j),
  );
  return { jobs: rows, total: Number(data?.total ?? rows.length) };
}

export async function fetchBoardJobDetail(
  jobId: string,
  auth?: AuthState | null,
): Promise<BoardJob | undefined> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  if (res.status === 404) return undefined;
  const data = await res.json().catch(() => null);
  const job = data?.job ?? data;
  if (!res.ok || !job?.id) return undefined;
  return normalizeJob(job as Record<string, unknown>);
}

export async function fetchMyBoardJobs(auth?: AuthState | null): Promise<BoardJob[]> {
  const res = await fetch('/api/services/board/jobs/mine', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return (Array.isArray(data?.jobs) ? data.jobs : []).map((j: Record<string, unknown>) =>
    normalizeJob(j),
  );
}

export async function fetchMyBoardApplications(
  auth?: AuthState | null,
): Promise<BoardJobApplication[]> {
  const res = await fetch('/api/services/board/jobs/applications', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.applications) ? data.applications : [];
}

export async function fetchSavedBoardJobs(auth?: AuthState | null): Promise<BoardJob[]> {
  const res = await fetch('/api/services/board/jobs/saved', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return (Array.isArray(data?.jobs) ? data.jobs : []).map((j: Record<string, unknown>) =>
    normalizeJob(j),
  );
}

export async function applyToBoardJob(
  jobId: string,
  auth?: AuthState | null,
): Promise<{ applicant_count: number }> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}/apply`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      'ส่งข้อเสนอไม่สำเร็จ';
    throw new Error(msg);
  }
  return { applicant_count: Number(data?.applicant_count ?? 0) };
}

export async function saveBoardJob(jobId: string, auth?: AuthState | null): Promise<void> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}/save`, {
    method: 'POST',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'บันทึกไม่สำเร็จ');
  }
}

export async function unsaveBoardJob(jobId: string, auth?: AuthState | null): Promise<void> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}/save`, {
    method: 'DELETE',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'ยกเลิกบันทึกไม่สำเร็จ');
  }
}

export function boardJobStatusTone(
  status: string,
): 'pending' | 'active' | 'completed' | 'cancelled' | 'default' {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'active';
  if (s === 'pending' || s === 'interested' || s === 'shortlisted') return 'pending';
  if (s === 'completed' || s === 'hired') return 'completed';
  if (s === 'closed' || s === 'rejected') return 'cancelled';
  return 'default';
}

export async function createBoardJob(
  payload: CreateBoardJobInput,
  auth?: AuthState | null,
): Promise<BoardJob> {
  const res = await fetch('/api/services/board/jobs', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      'โพสต์งานไม่สำเร็จ';
    throw new Error(msg);
  }
  const job = data?.job ?? data;
  return normalizeJob(job as Record<string, unknown>);
}

export async function fetchBoardApplicants(
  jobId: string,
  auth?: AuthState | null,
): Promise<BoardApplicant[]> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}/applicants`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.applicants) ? data.applicants : [];
}

export async function patchBoardApplicant(
  jobId: string,
  applicantUserId: string,
  status: 'shortlisted' | 'hired' | 'rejected',
  auth?: AuthState | null,
  agreed_amount?: number,
): Promise<void> {
  const res = await fetch(
    `/api/services/board/jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(applicantUserId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(auth),
      body: JSON.stringify({ status, agreed_amount }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'อัปเดตไม่สำเร็จ');
  }
}

export async function fetchBoardEscrowBreakdown(
  jobId: string,
  amount: number,
  auth?: AuthState | null,
  hasInsurance?: boolean,
): Promise<EscrowBreakdown> {
  const params = new URLSearchParams({ amount: String(amount) });
  if (hasInsurance) params.set('has_insurance', 'true');
  const res = await fetch(
    `/api/services/board/jobs/${encodeURIComponent(jobId)}/escrow-breakdown?${params}`,
    { cache: 'no-store', headers: authHeaders(auth) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'โหลดรายละเอียดไม่สำเร็จ');
  }
  return data as EscrowBreakdown;
}

export async function postBoardEscrow(
  jobId: string,
  amount: number,
  auth?: AuthState | null,
): Promise<{ escrow_amount: number; escrow_status: string }> {
  const res = await fetch(`/api/services/board/jobs/${encodeURIComponent(jobId)}/escrow`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error((typeof data?.error === 'string' && data.error) || 'โอน Escrow ไม่สำเร็จ');
  }
  return {
    escrow_amount: Number(data?.escrow_amount ?? amount),
    escrow_status: String(data?.escrow_status ?? 'held'),
  };
}

export type { BoardJobsTab, BoardJobFilters, CreateBoardJobInput };
