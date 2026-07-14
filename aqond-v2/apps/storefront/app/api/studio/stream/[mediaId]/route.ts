import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { kongJson } from '@/lib/server/kongFetch';
import { getMedia } from '@/lib/server/studioStore';

type PlaybackMeta = {
  manifest_url?: string;
  stream_url?: string;
  format?: string;
};

async function proxyUrl(url: string, contentType?: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return NextResponse.json({ error: 'upstream_failed', status: res.status }, { status: 502 });
  }
  const body = await res.arrayBuffer();
  const headers: Record<string, string> = {
    'Cache-Control': 'private, max-age=300',
  };
  if (contentType) headers['Content-Type'] = contentType;
  else if (res.headers.get('Content-Type')) {
    headers['Content-Type'] = res.headers.get('Content-Type')!;
  }
  return new NextResponse(body, { status: 200, headers });
}

export async function GET(
  req: NextRequest,
  ctx: { params: { mediaId: string } },
) {
  const mediaId = ctx.params.mediaId;
  const kind = req.nextUrl.searchParams.get('kind') || 'mp4';
  const segment = req.nextUrl.searchParams.get('seg');

  const local = await getMedia(mediaId);
  if (local) {
    const buf = await fs.readFile(local.filePath);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': local.meta.content_type || 'video/mp4',
        'Cache-Control': 'private, max-age=60',
      },
    });
  }

  const pb = await kongJson<PlaybackMeta>(`/api/v1/video/v1/media/${mediaId}/playback`);
  if (!pb) {
    return NextResponse.json({ error: 'playback_not_ready' }, { status: 404 });
  }

  if (kind === 'hls' && pb.manifest_url) {
    if (segment) {
      const base = pb.manifest_url.split('?')[0];
      const dir = base.replace(/\/[^/]+$/, '');
      const segUrl = `${dir}/${segment}${pb.manifest_url.includes('?') ? '?' + pb.manifest_url.split('?')[1] : ''}`;
      return proxyUrl(segUrl);
    }
    const manifestRes = await fetch(pb.manifest_url, { cache: 'no-store' });
    if (!manifestRes.ok) {
      return NextResponse.json({ error: 'manifest_failed' }, { status: 502 });
    }
    let text = await manifestRes.text();
    const qs = pb.manifest_url.includes('?') ? pb.manifest_url.split('?')[1] : '';
    text = text
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const seg = t.split('?')[0];
        const name = seg.replace(/^.*\//, '');
        return `/api/studio/stream/${mediaId}?kind=hls&seg=${encodeURIComponent(name)}${qs ? `&${qs}` : ''}`;
      })
      .join('\n');
    return new NextResponse(text, {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
    });
  }

  if (pb.stream_url) {
    return proxyUrl(pb.stream_url, 'video/mp4');
  }

  if (pb.manifest_url) {
    return proxyUrl(pb.manifest_url, 'application/vnd.apple.mpegurl');
  }

  return NextResponse.json({ error: 'no_stream' }, { status: 404 });
}
