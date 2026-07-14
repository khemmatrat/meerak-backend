import { NextRequest, NextResponse } from 'next/server';
import { runShopAiFlow } from '@/lib/server/shopAiSearch/flowHandler';
import { isShopAiCheckoutEnabled } from '@/lib/server/shopAiSearch/flags';
import { loadSession, resolveUserKey } from '@/lib/server/shopAiSearch/sessionStore';

export const maxDuration = 30;

type Body = {
  line_user_id?: string;
  user_id?: string;
  message?: string;
  postback_data?: string;
};

/**
 * Shop AI Search — Steps 1–4 only (search, refine, qty, cart summary).
 * Step 5+ (QR / payment / PIN) is NOT implemented; checkout postback returns blocked.
 */
export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  if (!body.line_user_id && !body.user_id) {
    return NextResponse.json(
      { ok: false, error: 'line_user_id or user_id required' },
      { status: 400 },
    );
  }

  const result = await runShopAiFlow({
    line_user_id: body.line_user_id,
    user_id: body.user_id,
    message: body.message,
    postback_data: body.postback_data,
  });

  return NextResponse.json({
    ...result,
    enable_ai_checkout: isShopAiCheckoutEnabled(),
  });
}

export async function GET(req: NextRequest) {
  const lineUserId = req.nextUrl.searchParams.get('line_user_id') || undefined;
  const userId = req.nextUrl.searchParams.get('user_id') || undefined;
  if (!lineUserId && !userId) {
    return NextResponse.json({ ok: false, error: 'line_user_id or user_id required' }, { status: 400 });
  }
  const session = await loadSession(resolveUserKey(lineUserId, userId));
  return NextResponse.json({
    ok: true,
    session,
    enable_ai_checkout: isShopAiCheckoutEnabled(),
  });
}
