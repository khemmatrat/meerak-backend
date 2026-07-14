import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

export async function proxyMatchJobsList(
  params: { category?: string; search?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.category && params.category !== 'All') q.set('category', params.category);
  if (params.search) q.set('search', params.search);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`${meerakBackendBase()}/api/jobs${suffix}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) return { ok: false as const, jobs: [] as unknown[], status: res.status };
  const rows = Array.isArray(data) ? data : data?.data || [];
  return { ok: true as const, jobs: rows, status: res.status };
}

export async function proxyMatchJobDetail(jobId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyMatchJobAccept(
  jobId: string,
  body: { userId: string; force_ignore_conflict?: boolean },
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/jobs/${encodeURIComponent(jobId)}/accept`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyCreateMatchJob(body: Record<string, unknown>, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/jobs`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyUserMatchJobs(
  userId: string,
  params: { includeExpired?: boolean },
  auth?: UpstreamAuth,
) {
  const q = params.includeExpired ? '?includeExpired=true' : '';
  const res = await fetch(
    `${meerakBackendBase()}/api/users/jobs/${encodeURIComponent(userId)}${q}`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => []);
  if (!res.ok) return { ok: false as const, jobs: [] as unknown[], status: res.status };
  const rows = Array.isArray(data) ? data : data?.data || [];
  return { ok: true as const, jobs: rows, status: res.status };
}

export async function proxyPaymentCreateIntent(
  body: {
    jobId: string;
    discountAmount?: number;
    has_insurance?: boolean;
    maturityVoucherId?: string | null;
  },
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/payments/create-intent`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}
