import { NextRequest, NextResponse } from 'next/server';
import { getProductImageUrl } from '@/lib/server/listingMediaStore';

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const image_url = await getProductImageUrl(ctx.params.id);
  if (!image_url) {
    return NextResponse.json({ image_url: null }, { status: 404 });
  }
  return NextResponse.json({ image_url, product_id: ctx.params.id });
}
