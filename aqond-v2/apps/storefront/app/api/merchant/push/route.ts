import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev, notifyApi } from '@/lib/server-env';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = body.user_id || body.owner_id;
  const fcmToken = body.fcm_token || body.token;
  const platform = body.platform || 'web';

  if (fcmToken && userId) {
    try {
      const res = await fetch(`${notifyApi('/v1/push/register')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Aqond-Region': 'TH',
          'X-User-Id': userId,
          ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
        },
        body: JSON.stringify({ user_id: userId, fcm_token: fcmToken, platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return NextResponse.json({ ok: true, ...data, source: 'notification-svc' });
    } catch {
      /* fall through */
    }
  }

  if (!allowLocalDev()) {
    return NextResponse.json({ error: 'fcm_register_failed' }, { status: 503 });
  }

  const legacy = await import('./legacyStore');
  await legacy.saveSubscription(body);
  return NextResponse.json({ ok: true, source: 'local-dev' });
}

export async function GET() {
  if (!allowLocalDev()) {
    return NextResponse.json({ count: 0, source: 'notification-svc' });
  }
  const legacy = await import('./legacyStore');
  const count = await legacy.count();
  return NextResponse.json({ count });
}
