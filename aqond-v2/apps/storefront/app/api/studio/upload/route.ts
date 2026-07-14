import { NextRequest, NextResponse } from 'next/server';
import { kongFetch } from '@/lib/server/kongFetch';
import { localMediaPlaybackUrl, saveMediaFile } from '@/lib/server/studioStore';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  const authorId = String(form.get('author_id') || req.nextUrl.searchParams.get('author_id') || 'creator-guest');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || 'video/mp4';

  const upstream = await kongFetch(
    `/api/v1/video/v1/media/upload?author_id=${encodeURIComponent(authorId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-Author-Id': authorId },
      body: buffer,
    },
  );

  if (upstream?.ok) {
    const data = await upstream.json();
    return NextResponse.json({
      ...data,
      mode: 'video-svc',
      playback_url: data.media_id
        ? `/api/video/v1/media/${data.media_id}/playback`
        : undefined,
    });
  }

  const local = await saveMediaFile(authorId, buffer, contentType);
  return NextResponse.json({
    media_id: local.media_id,
    status: 'ready',
    mode: 'local',
    playback_url: localMediaPlaybackUrl(local.media_id),
    message: 'video-svc unavailable — stored locally until stack is up',
  });
}
