import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getMedia } from '@/lib/server/studioStore';

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const hit = await getMedia(ctx.params.id);
  if (!hit) {
    return NextResponse.json({ error: 'media_not_found' }, { status: 404 });
  }
  const data = await fs.readFile(hit.filePath);
  return new NextResponse(data, {
    headers: {
      'Content-Type': hit.meta.content_type,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
