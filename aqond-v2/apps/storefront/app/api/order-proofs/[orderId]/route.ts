import { NextRequest, NextResponse } from 'next/server';
import { readLocalProofImage } from '@/lib/server/packingProof';

type Ctx = { params: Promise<{ orderId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { orderId } = await ctx.params;
  const hit = await readLocalProofImage(orderId);
  if (!hit) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(hit.buffer), {
    headers: {
      'Content-Type': hit.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
