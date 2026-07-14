import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

export async function proxyExperienceState(
  params: { surface?: string; guestId?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.surface) q.set('surface', params.surface);
  if (params.guestId) q.set('guestId', params.guestId);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`${meerakBackendBase()}/api/experience/state${suffix}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyExperiencePreferences(
  body: Record<string, unknown>,
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/experience/preferences`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyExperienceEvent(
  body: Record<string, unknown>,
  auth?: UpstreamAuth,
) {
  const res = await fetch(`${meerakBackendBase()}/api/experience/events`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyExperienceFlags() {
  const res = await fetch(`${meerakBackendBase()}/api/experience/flags`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ flags: {} }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyExperienceRollout() {
  const res = await fetch(`${meerakBackendBase()}/api/experience/rollout`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyJarvisBrief(
  params: { userId?: string; surface?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.userId) q.set('userId', params.userId);
  if (params.surface) q.set('surface', params.surface);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`${meerakBackendBase()}/api/experience/jarvis-brief${suffix}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}
