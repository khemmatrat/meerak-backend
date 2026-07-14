import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

export type AdvanceJobListParams = {
  status?: string;
  category?: string;
  target_province?: string;
  employment_type?: string;
  min_budget?: string;
  max_budget?: string;
  min_duration?: string;
  max_duration?: string;
  q?: string;
  page?: string;
  limit?: string;
  sort?: string;
};

function listQuery(params: AdvanceJobListParams): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function proxyAdvanceJobsList(params: AdvanceJobListParams, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs${listQuery(params)}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyAdvanceJobDetail(jobId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyAdvanceJobApply(jobId: string, body: Record<string, unknown>, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/apply`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyMyAdvanceJobs(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/my-jobs`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyMyAdvanceApplications(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/my-applications`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxySavedAdvanceJobs(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/saved`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxySaveAdvanceJob(jobId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/save`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyUnsaveAdvanceJob(jobId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/save`, {
    method: 'DELETE',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyCreateAdvanceJob(body: Record<string, unknown>, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyAdvanceJobApplicants(jobId: string, auth?: UpstreamAuth) {
  const res = await fetch(
    `${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/applicants`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyPatchAdvanceApplicant(
  jobId: string,
  applicantUserId: string,
  body: { status: string; agreed_amount?: number },
  auth?: UpstreamAuth,
) {
  const res = await fetch(
    `${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/applicants/${encodeURIComponent(applicantUserId)}`,
    {
      method: 'PATCH',
      headers: upstreamAuthHeaders(auth),
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyEscrowBreakdown(
  jobId: string,
  amount: number,
  auth?: UpstreamAuth,
  hasInsurance?: boolean,
) {
  const q = new URLSearchParams({ amount: String(amount) });
  if (hasInsurance) q.set('has_insurance', 'true');
  const res = await fetch(
    `${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/escrow-breakdown?${q}`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyPostAdvanceEscrow(
  jobId: string,
  amount: number,
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/advance-jobs/${encodeURIComponent(jobId)}/escrow`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify({ amount }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}
