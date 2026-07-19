import { NextRequest, NextResponse } from 'next/server';
import { getUserAiPreferences, saveUserAiPreferences } from '@/lib/server/aiTier3Store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
    || req.headers.get('x-user-id')
    || 'guest';
  const prefs = await getUserAiPreferences(userId);
  return NextResponse.json({ ok: true, preferences: prefs });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || req.headers.get('x-user-id') || '').trim();
  if (!userId || userId === 'guest') {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }
  const prefs = await saveUserAiPreferences(userId, {
    jarvis_voice_enabled: body.jarvis_voice_enabled,
    jarvis_locale: body.jarvis_locale,
    notify_ai_tips: body.notify_ai_tips,
    context_json: body.context_json,
  });
  return NextResponse.json({ ok: true, preferences: prefs });
}
