import { NextResponse } from 'next/server';
import { kongFetch } from '@/lib/server/kongFetch';

export async function GET() {
  const [feed, video, recsys] = await Promise.all([
    kongFetch('/api/v1/feed/health'),
    kongFetch('/api/v1/video/health'),
    kongFetch('/api/v1/recsys/health'),
  ]);

  return NextResponse.json({
    ok: true,
    feed_svc: feed?.ok ?? false,
    video_svc: video?.ok ?? false,
    recsys_svc: recsys?.ok ?? false,
    local_fallback: true,
    hint: 'Local .data/studio used when services return 503',
  });
}
