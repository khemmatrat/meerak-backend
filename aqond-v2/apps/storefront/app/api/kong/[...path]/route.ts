import { NextRequest, NextResponse } from 'next/server';

const KONG = (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = `${KONG}/api/v1/${path}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Aqond-Region': req.headers.get('x-aqond-region') || 'TH',
    },
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
    return NextResponse.json({ error: 'kong_unreachable', detail: e.message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
