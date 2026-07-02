import { NextRequest, NextResponse } from 'next/server';

const KONG = (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/');
  const url = `${KONG}/api/v1/shipping/${path}${req.nextUrl.search}`;
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
    if (!res.ok) {
      if (path === 'v1/shipping/quote' && req.method === 'POST') {
        return NextResponse.json({
          rates: [
            { carrier_id: 'flash-th', name: 'Flash Express', shipping_micro: 3900, cod_supported: true },
            { carrier_id: 'kerry-th', name: 'Kerry', shipping_micro: 4500, cod_supported: true },
          ],
          source: 'local-dev-fallback',
        });
      }
    }
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: any) {
    if (path === 'v1/shipping/quote' && req.method === 'POST') {
      return NextResponse.json({
        rates: [
          { carrier_id: 'flash-th', name: 'Flash Express', shipping_micro: 3900, cod_supported: true },
          { carrier_id: 'kerry-th', name: 'Kerry', shipping_micro: 4500, cod_supported: true },
        ],
        source: 'local-dev-fallback',
      });
    }
    return NextResponse.json({ error: 'shipping_unreachable', detail: e.message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
