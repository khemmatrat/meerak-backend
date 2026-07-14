import { NextRequest, NextResponse } from 'next/server';

const KONG = (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

function forwardHeaders(req: NextRequest): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Aqond-Region': req.headers.get('x-aqond-region') || 'TH',
  };
  const uid = req.headers.get('x-user-id') || req.headers.get('X-User-Id');
  if (uid) h['X-User-Id'] = uid;
  return h;
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = `${KONG}/api/v1/feed/${path}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders(req),
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }
  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'feed_unreachable', detail: e.message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
