import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

export async function proxyVideoFeed(
  params: { limit?: string; cursor?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', params.limit);
  if (params.cursor) q.set('cursor', params.cursor);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(`${meerakBackendBase()}/api/videos/feed${suffix}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyVideoSaved(auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/videos/saved`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(auth),
  });
  const data = await res.json().catch(() => ({ videos: [] }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyVideoLike(videoId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/videos/${encodeURIComponent(videoId)}/like`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyVideoSave(videoId: string, auth?: UpstreamAuth) {
  const res = await fetch(`${meerakBackendBase()}/api/videos/${encodeURIComponent(videoId)}/save`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyVideoComments(
  videoId: string,
  params: { limit?: string; cursor?: string },
  auth?: UpstreamAuth,
) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', params.limit);
  if (params.cursor) q.set('cursor', params.cursor);
  const suffix = q.toString() ? `?${q}` : '';
  const res = await fetch(
    `${meerakBackendBase()}/api/videos/${encodeURIComponent(videoId)}/comments${suffix}`,
    { cache: 'no-store', headers: upstreamAuthHeaders(auth) },
  );
  const data = await res.json().catch(() => ({ comments: [] }));
  return { ok: res.ok, data, status: res.status };
}

export async function proxyVideoAddComment(
  videoId: string,
  body: { text: string; parent_id?: string },
  auth?: UpstreamAuth,
) {
  const res = await fetch(
    `${meerakBackendBase()}/api/videos/${encodeURIComponent(videoId)}/comments`,
    {
      method: 'POST',
      headers: upstreamAuthHeaders(auth),
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}
