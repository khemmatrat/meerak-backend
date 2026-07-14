import type { AuthState } from '@/lib/bff';
import type { TalentVideo, VideoComment, VideoFeedResponse } from './videoTypes';

function authHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  return h;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export function canVideoEngage(video: TalentVideo): boolean {
  if (!video?.id) return false;
  if (video.id.startsWith('s3-') || video.id.startsWith('ad-')) return false;
  if (video.id === 'greeting') return false;
  if (video.mixKind === 'sponsored' || video.ad?.creativeId) return false;
  return UUID_RE.test(video.id);
}

export async function fetchVideoFeed(
  cursor?: string | null,
  auth?: AuthState | null,
  limit = 20,
): Promise<VideoFeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/services/video/feed?${params}`, {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { videos: [], nextCursor: null, hasMore: false };
  return {
    videos: Array.isArray(data?.videos) ? data.videos : [],
    nextCursor: data?.nextCursor ?? null,
    hasMore: !!data?.hasMore,
  };
}

export async function fetchSavedVideos(auth?: AuthState | null): Promise<TalentVideo[]> {
  const res = await fetch('/api/services/video/saved', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({ videos: [] }));
  if (!res.ok) return [];
  return Array.isArray(data?.videos) ? data.videos : [];
}

export async function toggleVideoLike(
  videoId: string,
  auth?: AuthState | null,
): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetch(`/api/services/video/videos/${encodeURIComponent(videoId)}/like`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || 'ไลค์ไม่สำเร็จ');
  return { liked: !!data.liked, like_count: Number(data.like_count ?? 0) };
}

export async function toggleVideoSave(
  videoId: string,
  auth?: AuthState | null,
): Promise<{ saved: boolean; save_count: number }> {
  const res = await fetch(`/api/services/video/videos/${encodeURIComponent(videoId)}/save`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || 'บันทึกไม่สำเร็จ');
  return { saved: !!data.saved, save_count: Number(data.save_count ?? 0) };
}

export async function fetchVideoComments(
  videoId: string,
  auth?: AuthState | null,
): Promise<VideoComment[]> {
  const res = await fetch(
    `/api/services/video/videos/${encodeURIComponent(videoId)}/comments?limit=30`,
    { cache: 'no-store', headers: authHeaders(auth) },
  );
  const data = await res.json().catch(() => ({ comments: [] }));
  return Array.isArray(data?.comments) ? data.comments : [];
}

export async function addVideoComment(
  videoId: string,
  text: string,
  auth?: AuthState | null,
): Promise<{ comment: VideoComment; comment_count: number }> {
  const res = await fetch(`/api/services/video/videos/${encodeURIComponent(videoId)}/comments`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((typeof data?.error === 'string' && data.error) || 'คอมเมนต์ไม่สำเร็จ');
  return data as { comment: VideoComment; comment_count: number };
}

export function formatEngagementCount(n: number | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}
