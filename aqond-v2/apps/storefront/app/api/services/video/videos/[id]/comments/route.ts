import { NextRequest, NextResponse } from 'next/server';
import { proxyVideoAddComment, proxyVideoComments } from '@/lib/server/videoProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const limit = req.nextUrl.searchParams.get('limit') || undefined;
  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  const out = await proxyVideoComments(id, { limit, cursor }, auth);
  if (!out.ok) return NextResponse.json({ comments: [] }, { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(out.data);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyVideoAddComment(
    id,
    { text: String(body.text || ''), parent_id: body.parent_id },
    auth,
  );
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
