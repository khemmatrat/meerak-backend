import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { notifyApi } from '@/lib/server-env';

const DATA_DIR = path.join(process.cwd(), '.data', 'notify');

type LocalStore = {
  push: Record<string, { platform: string; token: string; at: string }[]>;
  line: Record<string, { line_user_id: string; display_name: string; at: string }>;
};

async function readLocal(): Promise<LocalStore> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'registrations.json'), 'utf8');
    return JSON.parse(raw) as LocalStore;
  } catch {
    return { push: {}, line: {} };
  }
}

async function writeLocal(store: LocalStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'registrations.json'), JSON.stringify(store, null, 2));
}

async function tryLocal(
  segments: string[],
  method: string,
  req: NextRequest,
  bodyText: string,
): Promise<NextResponse | null> {
  const localDev =
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1';
  if (!localDev) return null;

  const pathKey = segments.join('/');
  const store = await readLocal();
  const uid =
    req.headers.get('x-user-id') ||
    req.headers.get('X-User-Id') ||
    new URL(req.url).searchParams.get('user_id') ||
    '';

  if (pathKey === 'v1/push/status' && method === 'GET') {
    const devices = (store.push[uid] || []).map((d) => ({
      platform: d.platform,
      endpoint: `fcm:${d.platform}`,
      registered: true,
      created_at: d.at,
    }));
    return NextResponse.json({ user_id: uid, push_enabled: devices.length > 0, devices, source: 'local-dev' });
  }

  if (pathKey === 'v1/push/register' && method === 'POST') {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const userId = String(body.user_id || uid || 'guest');
    const tok = String(body.fcm_token || body.token || '');
    const platform = String(body.platform || body.source || 'web');
    if (!tok) return NextResponse.json({ error: 'fcm_token required' }, { status: 400 });
    store.push[userId] = [{ platform, token: tok, at: new Date().toISOString() }];
    await writeLocal(store);
    return NextResponse.json({ ok: true, user_id: userId, platform, source: 'local-dev' });
  }

  if (pathKey === 'v1/line/status' && method === 'GET') {
    const hit = store.line[uid];
    return NextResponse.json({
      user_id: uid,
      line_linked: !!hit,
      line_user_id: hit?.line_user_id || '',
      display_name: hit?.display_name || '',
      source: 'local-dev',
    });
  }

  if (pathKey === 'v1/line/link' && method === 'POST') {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const userId = String(body.user_id || uid);
    const lineUID = String(body.line_user_id || '');
    if (!userId || !lineUID) return NextResponse.json({ error: 'user_id and line_user_id required' }, { status: 400 });
    store.line[userId] = {
      line_user_id: lineUID,
      display_name: String(body.display_name || ''),
      at: new Date().toISOString(),
    };
    await writeLocal(store);
    return NextResponse.json({ ok: true, user_id: userId, line_linked: true, source: 'local-dev' });
  }

  if (pathKey === 'v1/line/login-url' && method === 'GET') {
    return NextResponse.json({
      ok: false,
      error: 'line_login_not_configured',
      message: 'LINE OAuth ต้องตั้งค่า env หรือใช้โหมด dev ด้านล่าง',
      source: 'local-dev',
    });
  }

  return null;
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const segments = ctx.params.path;
  const url = `${notifyApi('/' + segments.join('/'))}${req.nextUrl.search}`;
  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
  };
  const uid = req.headers.get('x-user-id') || req.headers.get('X-User-Id');
  if (uid) headers['X-User-Id'] = uid;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;
  const sid = req.headers.get('x-session-id') || req.headers.get('X-Session-Id');
  if (sid) headers['X-Session-Id'] = sid;

  let bodyText = '';
  const init: RequestInit = { method: req.method, headers, cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyText = await req.text();
    init.body = bodyText;
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      const local = await tryLocal(segments, req.method, req, bodyText);
      if (local) return local;
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch {
    const local = await tryLocal(segments, req.method, req, bodyText);
    if (local) return local;
    return NextResponse.json({ error: 'notification_svc_unreachable' }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
