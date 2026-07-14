import { NextRequest, NextResponse } from 'next/server';
import { kongJson } from '@/lib/server/kongFetch';
import { getMedia, localMediaPlaybackUrl } from '@/lib/server/studioStore';

type PlaybackMeta = {
  media_id?: string;
  manifest_url?: string;
  stream_url?: string;
  format?: string;
  expires_at?: number;
};

/** Same-origin playback URL for feed video (proxies CDN / Kong). */
export async function GET(
  _req: NextRequest,
  ctx: { params: { mediaId: string } },
) {
  const mediaId = ctx.params.mediaId;
  if (!mediaId) {
    return NextResponse.json({ error: 'media_id required' }, { status: 400 });
  }

  const local = await getMedia(mediaId);
  if (local) {
    return NextResponse.json({
      media_id: mediaId,
      playback_url: localMediaPlaybackUrl(mediaId),
      format: 'mp4',
      source: 'local',
    });
  }

  const pb = await kongJson<PlaybackMeta>(`/api/v1/video/v1/media/${mediaId}/playback`);
  if (!pb) {
    return NextResponse.json({ error: 'playback_not_ready' }, { status: 404 });
  }

  const format = pb.format || (pb.stream_url ? 'mp4' : 'hls');
  const playbackUrl =
    format === 'mp4' && pb.stream_url
      ? `/api/studio/stream/${mediaId}`
      : `/api/studio/stream/${mediaId}?kind=hls`;

  return NextResponse.json({
    media_id: mediaId,
    playback_url: playbackUrl,
    format,
    expires_at: pb.expires_at,
    source: 'video-svc',
  });
}
