import { NextRequest, NextResponse } from 'next/server';
import { readListingImage } from '@/lib/server/listingMediaStore';

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const hit = await readListingImage(ctx.params.id);
  if (!hit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(hit.buffer), {
    headers: {
      'Content-Type': hit.mime,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
