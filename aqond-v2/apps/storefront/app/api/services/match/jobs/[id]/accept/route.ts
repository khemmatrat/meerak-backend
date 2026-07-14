import { NextRequest, NextResponse } from 'next/server';
import { proxyMatchJobAccept } from '@/lib/server/matchJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  const userId = body.userId || body.user_id || auth.userId;
  if (!userId) {
    return NextResponse.json({ error: 'login_required', message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }
  const out = await proxyMatchJobAccept(
    id,
    { userId: String(userId), force_ignore_conflict: body.force_ignore_conflict },
    auth,
  );
  return NextResponse.json(out.data, { status: out.status });
}
