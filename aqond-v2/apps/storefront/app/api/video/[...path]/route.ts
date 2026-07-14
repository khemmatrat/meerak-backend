import { NextRequest, NextResponse } from 'next/server';

const KONG = (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

function forwardHeaders(req: NextRequest, contentType?: string): Record<string, string> {
  const h: Record<string, string> = {
    'X-Aqond-Region': req.headers.get('x-aqond-region') || 'TH',
  };
  if (contentType) h['Content-Type'] = contentType;
  const author = req.headers.get('x-author-id') || req.headers.get('X-Author-Id');
  if (author) h['X-Author-Id'] = author;
  return h;
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = `${KONG}/api/v1/video/${path}${req.nextUrl.search}`;
  const contentType = req.headers.get('content-type') || undefined;
  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders(req, contentType),
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }
  try {
    const res = await fetch(url, init);
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'video_unreachable', detail: e.message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
