import { NextRequest, NextResponse } from 'next/server';
import { getMedia, listPosts, localMediaPlaybackUrl } from '@/lib/server/studioStore';
import { kongJson } from '@/lib/server/kongFetch';

const LOCAL_DEV = process.env.AQOND_LOCAL_DEV === '1' || process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1';

async function remoteFeed(kind: string, userId: string) {
  if (LOCAL_DEV) return null;
  const path =
    kind === 'following'
      ? `/api/v1/feed/v1/feed/following?user_id=${encodeURIComponent(userId)}&limit=30`
      : `/api/v1/feed/v1/feed/for-you?user_id=${encodeURIComponent(userId)}&limit=30`;
  return kongJson<{ items?: any[]; next_cursor?: string }>(path);
}

async function playbackForMedia(mediaId: string, mediaLocal?: boolean) {
  if (mediaLocal) return localMediaPlaybackUrl(mediaId);
  const local = await getMedia(mediaId);
  if (local) return localMediaPlaybackUrl(mediaId);
  if (LOCAL_DEV) return localMediaPlaybackUrl(mediaId);
  const pb = await kongJson<{ format?: string }>(
    `/api/v1/video/v1/media/${mediaId}/playback`,
  );
  if (!pb) return undefined;
  return `/api/studio/stream/${mediaId}${pb.format === 'hls' ? '?kind=hls' : ''}`;
}
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') || 'for-you';
  const userId = req.nextUrl.searchParams.get('user_id') || 'guest';

  const localPosts = await listPosts(50);
  const localItems = await Promise.all(
    localPosts.map(async (p) => ({
      post_id: p.post_id,
      author_id: p.author_id,
      media_id: p.media_id,
      caption: p.caption,
      post_type: 'video',
      source: 'local',
      playback_url: p.media_id ? await playbackForMedia(p.media_id, p.media_local) : undefined,
    })),
  );

  const remote = await remoteFeed(kind, userId);
  const remoteItems = await Promise.all(
    (remote?.items || []).map(async (item) => ({
      ...item,
      source: 'feed-svc',
      playback_url: item.media_id ? await playbackForMedia(item.media_id, false) : undefined,
    })),
  );

  const seen = new Set<string>();
  const merged = [...remoteItems, ...localItems].filter((item) => {
    const key = item.post_id || item.media_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let source: 'feed' | 'local' | 'mixed' | 'empty' = 'empty';
  if (remoteItems.length && localItems.length) source = 'mixed';
  else if (remoteItems.length) source = 'feed';
  else if (localItems.length) source = 'local';

  return NextResponse.json({
    items: merged,
    next_cursor: remote?.next_cursor || '',
    feed_type: kind,
    user_id: userId,
    source,
    services: {
      feed_svc: !!remote,
      local_count: localItems.length,
    },
  });
}
