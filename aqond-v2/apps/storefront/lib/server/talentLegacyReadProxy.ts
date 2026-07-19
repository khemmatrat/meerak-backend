import { meerakBackendBase } from '@/lib/server-env';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/** Whitelisted legacy read paths for Talent OS — transparent proxy only */
export function resolveTalentLegacyReadBackendPath(segments: string[]): string | null {
  if (segments.length === 2 && segments[0] === 'notifications' && segments[1] === 'latest') {
    return '/api/notifications/latest';
  }
  if (
    segments.length === 3 &&
    segments[0] === 'reviews' &&
    segments[1] === 'worker' &&
    segments[2]?.trim()
  ) {
    return `/api/reviews/worker/${encodeURIComponent(segments[2].trim())}`;
  }
  return null;
}

export async function proxyTalentLegacyRead(
  segments: string[],
  search: string,
  auth: UpstreamAuth,
): Promise<Response> {
  const backendPath = resolveTalentLegacyReadBackendPath(segments);
  if (!backendPath) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const url = `${meerakBackendBase()}${backendPath}${search}`;
  try {
    return await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: upstreamAuthHeaders(auth),
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'proxy_failed';
    return Response.json({ error: 'backend_unreachable', detail }, { status: 502 });
  }
}
